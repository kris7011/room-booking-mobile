# Screenshots

This folder contains genuine captures of the Room Booking user interface.
The three current screenshots were **cropped from developer-provided Chrome
screenshots** of the Expo Web app in a 390 × 844 CSS-pixel emulated mobile
viewport. Chrome's toolbar and DevTools are excluded. No UI was redrawn or
generated, and the images show the **web demo**, not native Android.

The source screenshots were displayed at a reduced scale; these crops retain
that resolution rather than inventing image detail.

## Available screenshots

| File | Screen | Mode |
|---|---|---|
| `search.png` | Search form: participants, day and time | Expo Web, demo mode |
| `results.png` | Two available demo rooms, including capacity | Expo Web, demo mode |
| `booking-form.png` | Booking form opened for Focus Room | Expo Web, demo mode |

## Still to capture

| File | Screen | Mode |
|---|---|---|
| `organisation-panel.png` | Signed-in account and active organisation | Native development build, with a fictional test organisation and test account |

The native Android development build and complete Microsoft sign-in remain
unverified end to end. Do not imply otherwise when using these images.

## Before committing a screenshot

- Prefer **demo mode**: its data is fictional and contains no personal data.
- Signed-in screens must use a **test account and a test organisation**. No
  real names, e-mail addresses, *Bruger-ID*s, invitation codes or links, API
  addresses other than `localhost`, or tenant or client IDs may be visible.
- Crop or clear the status bar and notifications.
- Check the image at full size before committing; Git history keeps it even
  after deletion.
