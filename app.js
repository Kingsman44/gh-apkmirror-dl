import { load } from "cheerio";
import { fetchHeaders } from "./fetch.js";
import {createWriteStream, existsSync} from 'fs'
import { Readable } from "stream";
import { finished } from "stream/promises";
import * as core from "@actions/core";

const BASE_URL = "https://www.apkmirror.com";


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

async function getStableLatestVersion(org, repo, versionPattern = null, includePrerelease = false) {
    const apkmUrl = `${BASE_URL}/apk/${org}/${repo}`;
    console.log(`[DEBUG] Fetching versions from: ${apkmUrl}`);
    
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
    
    console.log(`[DEBUG] Found versions (all): ${versions.length}`, versions.map(v => v.text));
    
    let filteredVersions = versions;
    
    // Filter alpha/beta only if includePrerelease is false
    if (!includePrerelease) {
        filteredVersions = filteredVersions.filter(
            (v) => !v.text.includes("alpha") && !v.text.includes("beta")
        );
        console.log(`[DEBUG] Stable versions (no alpha/beta): ${filteredVersions.length}`, filteredVersions.map(v => v.text));
    } else {
        console.log(`[DEBUG] Including prerelease versions (alpha/beta): ${filteredVersions.length}`);
    }
    
    if (versionPattern) {
        const regex = new RegExp(versionPattern);
        filteredVersions = filteredVersions.filter((v) => regex.test(v.text));
        console.log(`[DEBUG] Filtered by pattern '${versionPattern}': ${filteredVersions.length}`, filteredVersions.map(v => v.text));
    }
    
    const stableVersion = filteredVersions[0];
    
    if (!stableVersion) {
        throw new Error("Could not find version matching pattern: " + (versionPattern || "any"));
    }
    
    const extractedVersion = extractVersion(stableVersion.text);
    const releaseUrl = stableVersion.url;
    console.log(`[DEBUG] Extracted version: ${extractedVersion}`);
    console.log(`[DEBUG] Release URL: ${releaseUrl}`);
    return { version: extractedVersion, releaseUrl };
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
    
    console.log(`[DEBUG] Fetching variants from: ${apkmUrl}`);
    console.log(`[DEBUG] Looking for: ${bundle ? 'BUNDLE' : 'APK'}`);
    
    const response = await fetchHeaders(apkmUrl);
    const html = await response.text();
    const $ = load(html);
    
    var rows;
    if (bundle) {
        rows = $('.variants-table .table-row:has(span.apkm-badge:contains("BUNDLE"))');
    } else {
        rows = $('.variants-table .table-row:has(span.apkm-badge:contains("APK"))');
    }
    
    console.log(`[DEBUG] Found rows: ${rows.length}`);
    
    const parsedData = [];
    
    rows.each((_index, row) => {
        const columns = $(row).find(".table-cell");
        
        const variant = $(columns[0]).text().trim();
        const arch = $(columns[1]).text().trim();
        const version = $(columns[2]).text().trim();
        const dpi = $(columns[3]).text().trim();
        const url = $(columns[4]).find("a").attr("href");
        
        if (!variant || !arch || !version || !dpi || !url) {
            console.log(`[DEBUG] Skipped incomplete row: variant=${variant}, arch=${arch}, version=${version}, dpi=${dpi}, url=${url}`);
            return;
        }
        
        const rowData = {
            variant,
            arch,
            version,
            dpi,
            url,
        };
        
        console.log(`[DEBUG] Added variant: ${variant} (${arch}, ${dpi})`);
        parsedData.push(rowData);
    });
    
    console.log(`[DEBUG] Total parsed variants: ${parsedData.length}`);
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
const name = core.getInput('filename');
const overwrite = core.getBooleanInput('overwrite') ?? true;

console.log(`\n[INFO] Starting download process...`);
console.log(`[INFO] Org: ${org}, Repo: ${repo}`);
console.log(`[INFO] Version: ${version || '(auto-detect)'}, Pattern: ${versionPattern || '(none)'}`);
console.log(`[INFO] Include Prerelease: ${includePrerelease}, Bundle: ${bundle}, Filename: ${name || '(auto)'}\n`);

const selectedVersion = version || await getStableLatestVersion(org, repo, versionPattern, includePrerelease);
const selectedVersionStr = typeof selectedVersion === 'object' ? selectedVersion.version : selectedVersion;
const releaseUrl = typeof selectedVersion === 'object' ? selectedVersion.releaseUrl : null;

console.log(`\n[DEBUG] Selected version: ${selectedVersionStr}\n`);

const variants = releaseUrl 
    ? await getVariants(org, repo, releaseUrl)
    : await getVariantsWithVersion(org, repo, selectedVersionStr, bundle);

if (!variants || variants.length === 0) {
    throw new Error(`No variants found for ${repo} version ${selectedVersion}`);
}

console.log(`\n[INFO] Using variant: ${variants[0].variant} (${variants[0].arch}, ${variants[0].dpi})\n`);

const dlurl = await getDownloadUrl(variants[0].url)
const out = await downloadAPK(dlurl, name, overwrite)

if (out)
{
    core.setOutput('filename', out);
    core.info(`${repo} Successfully downloaded to '${out}'!`);
}