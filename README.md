# gh-apkmirror-dl
This GitHub Action allows you to download APK files from APKMirror.

**Features:**
- Download APK/APKM files from APKMirror
- Auto-detect latest version or specify exact version
- Regex pattern matching for version filtering (e.g., `.*-pixel`, `.*-gphone`)
- Filter by CPU architecture (arm64-v8a, armeabi-v7a) and DPI
- Extract APK metadata (signature, date, version, API level)
- Template-based filename generation with variant information
- Support for alpha/beta prerelease versions
- Full variant details in outputs

Credits to [@tanishqmanuja](https://github.com/tanishqmanuja) for the initial apkmirror scraping code.
Original action by [@Yakov5776](https://github.com/Yakov5776).

---

## Quick Start

### Comprehensive Example (All Features)
```yml
- uses: Kingsman44/gh-apkmirror-dl@v2
  id: download
  with:
    org: 'google-inc'
    repo: 'google-dialer'
    versionPattern: '.*-pixel'           # Match versions with "-pixel"
    includePrerelease: false             # Exclude alpha/beta
    arch: 'arm64-v8a'                    # Filter to 64-bit ARM only
    dpi: 'nodpi'                         # Filter to universal DPI
    filename: 'Dialer-${version}-api${minSdk}-${arch}.apk'
    bundle: false                        # Download APK (not AAB)
    overwrite: true                      # Overwrite if exists

# Use the outputs
- name: Display Download Info
  run: |
    echo "Downloaded: ${{ steps.download.outputs.filename }}"
    echo "Version: ${{ steps.download.outputs.version }}"
    echo "Architecture: ${{ steps.download.outputs.arch }}"
    echo "DPI: ${{ steps.download.outputs.dpi }}"
    echo "Signature: ${{ steps.download.outputs.signature }}"
    echo "Date: ${{ steps.download.outputs.date }}"
    echo "Min SDK: Android API ${{ steps.download.outputs.minSdk }}"
```

---

## Parameters

| Parameter | Description | Type | Default |
|-----------|-------------|------|---------|
| **org** | Organization name on APKMirror | `string` | Required |
| **repo** | Repository name on APKMirror | `string` | Required |
| **version** | Specific version (e.g., `14.0.0`) | `string` | Auto-detect latest |
| **versionPattern** | Regex to match versions (e.g., `.*-pixel`, `gphone\|pixel`) | `string` | None |
| **includePrerelease** | Include alpha/beta versions | `boolean` | `false` |
| **arch** | Filter by CPU architecture (e.g., `arm64-v8a`, `armeabi-v7a`) | `string` | First available |
| **dpi** | Filter by screen DPI (e.g., `nodpi`, `hdpi`, `xxhdpi`) | `string` | First available |
| **bundle** | Download AAB bundle instead of APK | `boolean` | `false` |
| **filename** | Output filename with template variables | `string` | Server default |
| **overwrite** | Overwrite existing file | `boolean` | `true` |

### Filename Template Variables

Use these in the `filename` parameter:
- `${version}` - App version number
- `${variant}` - Android version variant (e.g., Android 14)
- `${arch}` - CPU architecture (e.g., arm64-v8a)
- `${dpi}` - Screen DPI (e.g., nodpi)
- `${minSdk}` - Minimum API level (e.g., 30)
- `${signature}` - APK signature hash
- `${date}` - Release date

---

## Outputs

| Output | Description |
|--------|-------------|
| **filename** | Downloaded file name |
| **version** | App version number |
| **variant** | Android variant (e.g., Android 14) |
| **arch** | CPU architecture |
| **dpi** | Screen DPI |
| **minSdk** | Minimum Android API level |
| **signature** | APK signature hash |
| **date** | Release date (UTC) |

---

## Version History

- **v2.0** - Major update with metadata extraction, filtering, and template filenames
  - Extract signature, date, API level, architecture, DPI
  - Filter variants by architecture and DPI
  - Template-based filename generation
  - Improved version pattern matching
- **v1.4** - Added regex version pattern matching and prerelease support
- **v1.3** - Initial release with basic APK/bundle download