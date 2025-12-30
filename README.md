# gh-apkmirror-dl
This GitHub Action allows you to download APK files from APKMirror.
It supports specifying the organization, repository, app version, version patterns with regex, prerelease inclusion, bundle downloads, and custom file naming.

Credits to [@tanishqmanuja](https://github.com/tanishqmanuja) for the initial apkmirror scraping code.
Original action by [@Yakov5776](https://github.com/Yakov5776).


## Example Usage

### Basic Usage (Latest Stable Version)
```yml
- uses: Kingsman44/gh-apkmirror-dl@v1.4
  with:
    org: 'google-inc'
    repo: 'google-phone'
    bundle: false
    filename: 'phone.apk'
```

### Download Specific Version
```yml
- uses: Kingsman44/gh-apkmirror-dl@v1.4
  with:
    org: 'fidelity-investments'
    repo: 'fidelity-investments'
    version: '3.96'
    bundle: false
    filename: 'fidelity.apk'
```

### Download with Version Pattern (Regex)
```yml
- uses: Kingsman44/gh-apkmirror-dl@v1.4
  with:
    org: 'google-inc'
    repo: 'google-phone'
    versionPattern: '.*-pixel$'
    bundle: false
    filename: 'phone-pixel.apk'
```

### Include Prerelease Versions
```yml
- uses: Kingsman44/gh-apkmirror-dl@v1.4
  with:
    org: 'google-inc'
    repo: 'google-phone'
    versionPattern: '.*-alpha'
    includePrerelease: true
    bundle: false
    filename: 'phone-alpha.apk'
```

## Parameters

| Parameter | Description | Required | Default |
|-----------|-------------|----------|---------|
| **org** | Organization name on APKMirror | Yes | - |
| **repo** | Repository name on APKMirror | Yes | - |
| **version** | Specific version to download (e.g., `14.0.0`) | No | Auto-detect latest |
| **versionPattern** | Regex pattern to match versions (e.g., `.*-pixel`, `.*-gphone`, `10\.[0-2].*`) | No | None |
| **includePrerelease** | Include alpha/beta versions when auto-detecting | No | `false` |
| **bundle** | Download app bundle (AAB) instead of APK | No | `false` |
| **filename** | Output filename (uses server filename if not specified) | No | Server default |
| **overwrite** | Overwrite existing file | No | `true` |

## Outputs

- **filename**: The filename the app was downloaded as

## Examples

### Download Latest Google Phone APK
```yml
- uses: Kingsman44/gh-apkmirror-dl@v1.4
  with:
    org: 'google-inc'
    repo: 'google-phone'
    filename: 'google-phone.apk'
```

### Download Latest Google Dialer with Specific Variant
```yml
- uses: Kingsman44/gh-apkmirror-dl@v1.4
  with:
    org: 'google-inc'
    repo: 'google-dialer'
    versionPattern: '.*-pixel'  # Match versions with -pixel
    bundle: false
```

### Download with Multiple Pattern Options
```yml
- uses: Kingsman44/gh-apkmirror-dl@v1.4
  with:
    org: 'google-inc'
    repo: 'google-phone'
    versionPattern: 'gphone|pixel'  # Match either gphone OR pixel
    bundle: false
```

### Download and Check Output
```yml
- uses: Kingsman44/gh-apkmirror-dl@v1.4
  id: download
  with:
    org: 'google-inc'
    repo: 'google-phone'
    filename: 'phone.apk'

- name: Show downloaded file
  run: echo "Downloaded: ${{ steps.download.outputs.filename }}"
```

## Version History

- **v1.4** - Added regex version pattern matching and prerelease version support
- **v1.3** - Initial release with basic APK/bundle download