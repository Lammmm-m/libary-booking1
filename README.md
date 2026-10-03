# Library Booking V5.1

GitHub Pages frontend + Google Apps Script + Google Sheet.

## V5.1 fixes the GitHub Pages "Failed to fetch" problem

GitHub Pages and Google Apps Script are different origins. The frontend therefore does not use normal `fetch()` calls to Apps Script.

Instead:

- GET `/list` uses JSONP through Apps Script ContentService.
- POST `/book` uses a normal HTML form POST to a hidden iframe.
- The frontend then reads `/list` again to verify the booking in the Sheet.

## Google Apps Script

Replace your current `Code.gs` with `google-apps-script.gs`.

Deploy as a Web app:

- Execute as: Me
- Who has access: Anyone

After saving the script, create a **new deployment version**.

Keep the same `/exec` Web App URL if possible.

## GitHub Pages

Replace `script.js` in your GitHub repository with the V5.1 version.

Keep `config.js` containing your existing Web App URL:

const GOOGLE_APPS_SCRIPT_URL = "YOUR_WEB_APP_EXEC_URL";

Do not add `?action=list...` to this setting.

## Booking rules

- Rooms 1-3: Monday-Friday, 07:30-21:00
- Rooms 4-7: every day, 08:00-21:15
- Today or tomorrow only
- Today: start time must be in the future
- Maximum duration: 2 hours
- Overlapping bookings are rejected server-side
- LockService prevents simultaneous double-booking

## Security note

The read endpoint uses JSONP, so it should only return non-sensitive booking information. The implementation does not expose a separate secret token or password.
