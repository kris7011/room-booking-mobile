# Screenshots

This folder is reserved for real screenshots of the app, referenced from the
main [README](../../README.md). It holds none yet: the app has not been
captured on a device, and mock-ups or generated images are not used.

## Planned captures

| File | Screen | Mode |
|---|---|---|
| `search.png` | Search form with participants, day and time | Demo mode |
| `results.png` | Free rooms, smallest fitting first | Demo mode |
| `booking-form.png` | Booking form, including a validation message | Demo mode |
| `organisation-panel.png` | Signed-in account and active organisation | Test organisation and test account |

Capture them from the Android development build (or the web build at a
phone-sized viewport), as PNG, about 1080 px wide or less.

## Before committing a screenshot

- Prefer **demo mode**: its data is fictional and contains no personal data.
- Signed-in screens must use a **test account and a test organisation**. No
  real names, e-mail addresses, *Bruger-ID*s, invitation codes or links, API
  addresses other than `localhost`, or tenant or client IDs may be visible.
- Crop or clear the status bar and notifications.
- Check the image at full size before committing; Git history keeps it even
  after deletion.
