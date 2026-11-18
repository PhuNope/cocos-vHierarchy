# Test builds and releases

- Normal development commits may be pushed to `main` and built with `.github/workflows/test-build.yml`.
- Test ZIPs are **workflow artifacts only**, never GitHub Releases.
- Do not create a Git tag, release, or release-build until the user explicitly approves ("chốt") the tested version.
- Once approved, create a release from the approved commit and package it separately from test builds.
- Release notes must describe **only features added and bugs fixed since the previous release**, not an exhaustive list of all existing features.
- Keep any unverified Editor drag-and-drop behavior labeled as needing real Editor testing.
