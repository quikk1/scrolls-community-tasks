# OASIS 1.3.11 development update

Both confirmed-success exits return the completed email, site and registration status. This keeps the Results row and copied results populated after the temporary profile is removed. The early duplicate gate still stops before any success result. Test with `node scripts/test-oasis-results.cjs`; it uses the real graph runtime with no browser or external calls.

This local update enables the shared address/email run form with the development catalog's `addressMode: "database"` flag. Remove the old `emailMode: "list"` restriction so users can select saved address emails, an email list or catch-all. The address source, group and individual selectors use the existing NBA-style one-to-one pairing implementation.

The graph separates the site's five delivery inputs using their truck-icon field containers, which are independent of translated labels. House and Street come from the selected address's first line; apartment information from the second line is included with House. City, Country and ZIP use the same selected record. It verifies every value before continuing. Unsplit street lines, missing fields and changed form layouts report an error.

Name filling excludes delivery inputs. City/Town autocomplete uses the selected record's city even when the same page also asks for a full delivery address. The flow fills delivery, then checks for the separate town input and selects its suggestion before moving to the DOB/consent steps. Forms with no location field skip the autocomplete steps.

Build an unsigned development bundle without changing the signed 1.3.8 source:

```powershell
node scripts/build-oasis-details-fix.cjs C:\dev\Scrolls\.local\oasis-dev\oasis.arcana-task.json
node scripts/test-oasis-details-fix.cjs
```

The form tests use real Chromium and the compiled Scrolls graph runtime with synthetic records. They do not submit a signup, send messages or call a live location service. The development bundle has no publisher signature; the public catalog remains unchanged.
