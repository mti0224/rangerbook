# V2 correction package

This PR contains public data, the independent preview, the public-data auditor, authored catalogs and a semantic patch. It does not activate the patch in the production updater or change the production website's V1 readers.

The complete EC2 entry-point/publisher changes and source hashes are retained in the private correction bundle. Apply those together with the semantic patch; applying only the catalog files or only the generated JSON is insufficient.

## Isolated verification

Copy the existing V2 source and its own raw/locale inputs into a separate test project. Do not copy V1 outputs. Keep a backup and check the package's source hashes before applying the complete patch.

```sh
patch --dry-run -p1 < complete-v2-changes.patch
patch -p1 < complete-v2-changes.patch
python3 update_all_v2.py --skip-fetch
python3 -m unittest scripts.v2.test_release scripts.v2.test_publisher -v
python3 -m scripts.v2.validate --root data/v2
```

Failure injection additionally requires an explicitly isolated project with `.isolated-v2-test`; it is intentionally skipped without that marker. Never create that marker in a production project.

```sh
python3 -m unittest scripts.v2.test_failure_isolation -v
```

The updated runner builds into a candidate directory, validates all catalogs/schema/text bindings and tests, then promotes the candidate while retaining the prior successful release. Direct Python invocations share the existing V2 shell lock, and publishing revalidates the release. Push retries rebuild from the latest remote head and only stage `res/v2/`.

## Authored language inputs

`locales/custom.json` and `locales/ui.json` are the independent V2 author-maintained input files. Custom input keys omit `CUSTOM:`; UI input keys retain `UI:`. The compiler publishes the standard five-field catalogs. Automatic official API refreshes never write these input files.

Official source gaps remain explicitly classified. All text references exist in a catalog, but that does not mean the official API provides all translations. `allReferencedTranslationsComplete=false` must remain visible while those gaps exist. The correction bundle does not invent official character or skill names.
