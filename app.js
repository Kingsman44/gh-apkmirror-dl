import { load } from "cheerio";
import { fetchHeaders } from "./fetch.js";
import {createWriteStream, existsSync} from 'fs'
import { Readable } from "stream";
import { finished } from "stream/promises";
import * as core from "@actions/core";

const BASE_URL = "https://www.apkmirror.com";

const DEBUG = (core.getInput('DEBUG') || '').toLowerCase() === 'true';
function debugLog(...args) {
    if (DEBUG) console.log(...args);
}


async function getHtmlForApkMirror(url) {
    return fetchHeaders(BASE_URL + url).then((r) => r.text());
}

async function getDownloadPageUrl(downloadPageUrl) {
    const html = await getHtmlForApkMirror(downloadPageUrl);
    const $ = load(html);
    
    const downloadUrl = $(`a.downloadButton`).attr("href");
    
    if (!downloadUrl) {
        throw new Error("Could not find download page url");
    }
    
    return downloadUrl;
}

async function getDirectDownloadUrl(downloadPageUrl) {
    const html = await getHtmlForApkMirror(downloadPageUrl);
    const $ = load(html);
    
    const downloadUrl = $(`.card-with-tabs a[href]`).attr("href");
    
    if (!downloadUrl) {
        throw new Error("Could not find direct download url");
    }
    
    return downloadUrl;
}

function extractVersion(input) {
    const versionRegex = /\b\d+(\.\d+)+(-\S+)?\b/;
    const match = input.match(versionRegex);
    
    return match ? match[0] : undefined;
}

function extractMinSdk(input) {
    // Extract Android version (e.g., "Android 11+", "Android 12", "Android 13+")
    const androidRegex = /Android\s+(\d+(?:\.\d+)?L?)\+?/i;
    const match = input.match(androidRegex);
    
    if (match && match[1]) {
        const versionStr = match[1];
        return versionStr;
    }
    
    return null;
}

function versionToApiLevel(versionStr) {
    const versionMap = {
        '16': 36,
        '15': 35,
        '14': 34,
        '13': 33,
        '12.1': 32,
        '12L': 32,
        '12': 31,
        '11': 30,
        '10': 29,
        '9': 28,
        '8.1': 27,
        '8.1.0': 27,
        '8.0': 26,
        '8.0.0': 26,
        '7.1': 25,
        '7.0': 24,
        '6.0': 23,
        '5.1': 22,
        '5.0': 21,
        '4.4': 19,
        '4.3': 18,
        '4.2': 17,
        '4.1': 16,
        '4.0': 15,
        '3.2': 13,
        '3.1': 12,
        '3.0': 11,
        '2.3': 10,
        '2.2': 8,
        '2.1': 7,
        '2.0': 5,
        '1.6': 4,
        '1.5': 3,
        '1.1': 2,
        '1.0': 1
    };
    
    // Try exact match first
    if (versionMap[versionStr]) {
        return versionMap[versionStr];
    }
    
    // Try with first two parts (e.g., "8.1" from "8.1.0")
    const parts = versionStr.split('.');
    if (parts.length >= 2) {
        const majorMinor = `${parts[0]}.${parts[1]}`;
        if (versionMap[majorMinor]) {
            return versionMap[majorMinor];
        }
    }
    
    // Try with just major version (e.g., "8" from "8.0.0")
    const major = parts[0];
    if (versionMap[major]) {
        return versionMap[major];
    }
    
    return null;
}

async function getStableLatestVersion(org, repo, versionPattern = null, includePrerelease = false) {
    const apkmUrl = `${BASE_URL}/apk/${org}/${repo}`;
    debugLog(`[DEBUG] Fetching versions from: ${apkmUrl}`);
    
    const response = await fetchHeaders(apkmUrl);
    const html = await response.text();
    const $ = load(html);
    
    const versions = $(
        `#primary > div.listWidget.p-relative > div > div.appRow > div > div:nth-child(2) > div > h5 > a`
    )
    .toArray()
    .map((v) => ({
        text: $(v).text(),
        url: $(v).attr("href")
    }));
    
    debugLog(`[DEBUG] Found versions (all): ${versions.length}`, versions.map(v => v.text));
    
    let filteredVersions = versions;
    
    // Filter alpha/beta only if includePrerelease is false
    if (!includePrerelease) {
        filteredVersions = filteredVersions.filter(
            (v) => !v.text.includes("alpha") && !v.text.includes("beta")
        );
        debugLog(`[DEBUG] Stable versions (no alpha/beta): ${filteredVersions.length}`, filteredVersions.map(v => v.text));
    } else {
        debugLog(`[DEBUG] Including prerelease versions (alpha/beta): ${filteredVersions.length}`);
    }
    
    if (versionPattern) {
        const regex = new RegExp(versionPattern);
        filteredVersions = filteredVersions.filter((v) => regex.test(v.text));
        debugLog(`[DEBUG] Filtered by pattern '${versionPattern}': ${filteredVersions.length}`, filteredVersions.map(v => v.text));
    }
    
    const stableVersion = filteredVersions[0];
    
    if (!stableVersion) {
        throw new Error("Could not find version matching pattern: " + (versionPattern || "any"));
    }
    
    const extractedVersion = extractVersion(stableVersion.text);
    const minSdkVersion = extractMinSdk(stableVersion.text);
    const minSdkApiLevel = minSdkVersion ? versionToApiLevel(minSdkVersion) : null;
    const releaseUrl = stableVersion.url;
    debugLog(`[DEBUG] Extracted version: ${extractedVersion}`);
    if (minSdkVersion) {
        debugLog(`[DEBUG] Minimum SDK: Android ${minSdkVersion} (API level ${minSdkApiLevel})`);
    }
    debugLog(`[DEBUG] Release URL: ${releaseUrl}`);
    return { version: extractedVersion, minSdkVersion, minSdkApiLevel, releaseUrl };
}

async function getDownloadUrl(downloadPageUrl) {
    return getDownloadPageUrl(downloadPageUrl)
    .then((d) => getDirectDownloadUrl(d))
    .then((d) => BASE_URL + d);
}

export async function getVariants(org, repo, versionOrUrl, bundle) {
    // If versionOrUrl is a URL path (starts with /), use it directly
    // Otherwise, construct the URL from version number
    let apkmUrl;
    if (versionOrUrl.startsWith('/')) {
        apkmUrl = BASE_URL + versionOrUrl;
    } else {
        apkmUrl = `${BASE_URL}/apk/${org}/${repo}/${repo}-${versionOrUrl.replaceAll(
            ".",
            "-"
        )}-release`;
    }
    
    debugLog(`[DEBUG] Fetching variants from: ${apkmUrl}`);
    debugLog(`[DEBUG] Looking for: ${bundle ? 'BUNDLE' : 'APK'}`);
    
    const response = await fetchHeaders(apkmUrl);
    const html = await response.text();
    const $ = load(html);
    
    var rows;
    if (bundle) {
        rows = $('.variants-table .table-row:has(span.apkm-badge:contains("BUNDLE"))');
    } else {
        rows = $('.variants-table .table-row:has(span.apkm-badge:contains("APK"))');
    }
    
    debugLog(`[DEBUG] Found rows: ${rows.length}`);
    
    const parsedData = [];
    
    rows.each((_index, row) => {
        const columns = $(row).find(".table-cell");
        
        // Column 0: Version (extract from link text)
        const versionLink = $(columns[0]).find("a");
        const version = versionLink.text().trim();
        
        // Column 1: Architecture
        const arch = $(columns[1]).text().trim();
        
        // Column 2: Android version/Variant
        const variant = $(columns[2]).text().trim();
        
        // Column 3: DPI
        const dpi = $(columns[3]).text().trim();
        
        // Column 4: Download URL
        const url = $(columns[4]).find("a").attr("href");
        
        // Last column: Extended details (signature, date)
        const lastColumn = columns[columns.length - 1];
        const extendedCell = $(lastColumn);
        
        // Extract signature from tooltip
        const signatureSpan = extendedCell.find('.signature');
        const signatureTooltip = signatureSpan.attr('data-apkm-tooltip') || '';
        const signatureMatch = signatureTooltip.match(/Signature: ([a-f0-9]+)/i);
        const signature = signatureMatch ? signatureMatch[1] : signatureSpan.text().trim();
        
        // Extract date
        const dateSpan = extendedCell.find('.dateyear_utc');
        const dateText = dateSpan.attr('data-utcdate') || dateSpan.text().trim();
        
        if (!variant || !arch || !version || !dpi || !url) {
            debugLog(`[DEBUG] Skipped incomplete row: variant=${variant}, arch=${arch}, version=${version}, dpi=${dpi}, url=${url}`);
            return;
        }
        
        // Extract SDK version and API level from variant
        const variantMinSdk = extractMinSdk(variant);
        const variantMinSdkApiLevel = variantMinSdk ? versionToApiLevel(variantMinSdk) : null;
        
        const rowData = {
            variant,
            arch,
            version,
            dpi,
            url,
            date: dateText,
            signature,
            minSdkVersion: variantMinSdk,
            minSdkApiLevel: variantMinSdkApiLevel
        };

        debugLog(`[DEBUG] Added variant: ${variant} (${arch}, ${dpi}) - API ${variantMinSdkApiLevel} - ${signature} - ${dateText}`);
        parsedData.push(rowData);
    });
    
    debugLog(`[DEBUG] Total parsed variants: ${parsedData.length}`);
    return parsedData;
}

async function getVariantsWithVersion(org, repo, version, bundle) {
    return getVariants(org, repo, version, bundle);
}

async function downloadAPK(url, name, overwrite = true) {
    const response = await fetchHeaders(url);
    let filename = name;

    const finalUrl = response.url;
    const urlObj = new URL(finalUrl);
    const pathname = urlObj.pathname;
    const lastSegment = pathname.split('/').pop();
    const defaultFilename = decodeURIComponent(lastSegment.split('?')[0]);

    if (!filename) filename = defaultFilename
    if (existsSync(filename) && overwrite === false)
    {
        core.info('download has been skipped because file already exists!');
        return;
    }

    const body = response.body;
    let isAPK = filename.endsWith('.apk') || filename.endsWith('.apkm');
    
    if (body != null && isAPK) {
        const fileStream = createWriteStream(filename, { flags: "w" });
        await finished(Readable.fromWeb(body).pipe(fileStream));
        return filename;
    } else {
        throw new Error("An error occurred while trying to download the file");
    }
}

const org = core.getInput('org', { required: true });
const repo = core.getInput('repo', { required: true });
const version = core.getInput('version');
const versionPattern = core.getInput('versionPattern');
const includePrerelease = core.getBooleanInput('includePrerelease');
const bundle = core.getBooleanInput('bundle');
const archFilter = core.getInput('arch');
const dpiFilter = core.getInput('dpi');
const name = core.getInput('filename');
const overwrite = core.getBooleanInput('overwrite') ?? true;

console.log(`\n[INFO] Starting download process...`);
console.log(`[INFO] Org: ${org}, Repo: ${repo}`);
console.log(`[INFO] Version: ${version || '(auto-detect)'}, Pattern: ${versionPattern || '(none)'}`);
console.log(`[INFO] Include Prerelease: ${includePrerelease}, Bundle: ${bundle}, Filename: ${name || '(auto)'}\n`);

const selectedVersion = version || await getStableLatestVersion(org, repo, versionPattern, includePrerelease);
const selectedVersionStr = typeof selectedVersion === 'object' ? selectedVersion.version : selectedVersion;
const selectedMinSdkVersion = typeof selectedVersion === 'object' ? selectedVersion.minSdkVersion : null;
const selectedMinSdkApiLevel = typeof selectedVersion === 'object' ? selectedVersion.minSdkApiLevel : null;
const releaseUrl = typeof selectedVersion === 'object' ? selectedVersion.releaseUrl : null;

debugLog(`\n[DEBUG] Selected version: ${selectedVersionStr}`);
if (selectedMinSdkVersion) {
    debugLog(`[DEBUG] Minimum SDK: Android ${selectedMinSdkVersion} (API level ${selectedMinSdkApiLevel})`);
}
debugLog('');

const variants = releaseUrl 
    ? await getVariants(org, repo, releaseUrl)
    : await getVariantsWithVersion(org, repo, selectedVersionStr, bundle);

if (!variants || variants.length === 0) {
    throw new Error(`No variants found for ${repo} version ${selectedVersion}`);
}

// Filter variants by arch and dpi if specified
let selectedVariant = variants[0];
if (archFilter || dpiFilter) {
    let filtered = variants;
    
        if (archFilter) {
        filtered = filtered.filter(v => v.arch.toLowerCase() === archFilter.toLowerCase());
        if (filtered.length === 0) {
            throw new Error(`No variants found for arch: ${archFilter}`);
        }
        debugLog(`[DEBUG] Filtered by arch '${archFilter}': ${filtered.length} variant(s)`);
    }
    
    if (dpiFilter) {
        filtered = filtered.filter(v => v.dpi.toLowerCase() === dpiFilter.toLowerCase());
        if (filtered.length === 0) {
            throw new Error(`No variants found for dpi: ${dpiFilter}`);
        }
        debugLog(`[DEBUG] Filtered by dpi '${dpiFilter}': ${filtered.length} variant(s)`);
    }
    
    selectedVariant = filtered[0];
}
const variantMinSdkApiLevel = selectedVariant.minSdkApiLevel || selectedMinSdkApiLevel;

console.log(`\n[INFO] Using variant:`);
console.log(`[INFO]   Variant: ${selectedVariant.variant}`);
console.log(`[INFO]   Architecture: ${selectedVariant.arch}`);
console.log(`[INFO]   DPI: ${selectedVariant.dpi}`);
console.log(`[INFO]   Version: ${selectedVariant.version}`);
if (selectedVariant.date) {
    console.log(`[INFO]   Date: ${selectedVariant.date}`);
}
if (selectedVariant.signature) {
    console.log(`[INFO]   Signature: ${selectedVariant.signature}`);
}
console.log(`[INFO]   API Level: ${variantMinSdkApiLevel}\n`);

const dlurl = await getDownloadUrl(selectedVariant.url)

// Build filename with template variables
let finalFilename = name;
if (finalFilename) {
    // Replace template variables
    finalFilename = finalFilename
        .replace(/\$\{version\}/g, selectedVariant.version)
        .replace(/\$\{variant\}/g, selectedVariant.variant)
        .replace(/\$\{arch\}/g, selectedVariant.arch)
        .replace(/\$\{dpi\}/g, selectedVariant.dpi)
        .replace(/\$\{minSdk\}/g, variantMinSdkApiLevel)
        .replace(/\$\{signature\}/g, selectedVariant.signature || '')
        .replace(/\$\{date\}/g, selectedVariant.date || '');
    
    debugLog(`[DEBUG] Final filename: ${finalFilename}`);
}

const out = await downloadAPK(dlurl, finalFilename, overwrite)

if (out)
{
    core.setOutput('filename', out);
    if (variantMinSdkApiLevel) {
        core.setOutput('minSdk', variantMinSdkApiLevel.toString());
    }
    core.setOutput('variant', selectedVariant.variant);
    core.setOutput('arch', selectedVariant.arch);
    core.setOutput('dpi', selectedVariant.dpi);
    core.setOutput('version', selectedVariant.version);
    if (selectedVariant.date) {
        core.setOutput('date', selectedVariant.date);
    }
    if (selectedVariant.signature) {
        core.setOutput('signature', selectedVariant.signature);
    }
    core.info(`${repo} Successfully downloaded to '${out}'!`);
    if (variantMinSdkApiLevel) {
        core.info(`Minimum SDK: API level ${variantMinSdkApiLevel}`);
    }
}