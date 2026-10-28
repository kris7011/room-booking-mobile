# Screenshots

This folder contains genuine captures of the Room Booking user interface.

`android-member-bookings.png` was captured with `adb exec-out screencap` from
the **Android development build** on a Samsung SM-A057G on 28 October 2026,
during the booking-privacy check (PR #37), on an isolated database copy. The
organisation ("Privatlivstest"), the room, the booking title and "Testperson"
are test data; the other booking belongs to a synthetic placeholder user.
The status bar and the navigation bar were cropped; nothing else was changed.
The floating gear is the development client's menu button. No account name,
e-mail address, *Bruger-ID*, token or API address other than `localhost` is
visible.

The three Expo Web screenshots were **captured directly from Chrome's
mobile viewport** (390 × 844 CSS pixels at device pixel ratio 2,
producing 780 × 1688 PNG files) and provided by the project owner.
The browser toolbar and DevTools do not appear in these captures.
The PNGs were optimized losslessly for GitHub (opaque alpha removed);
the visible pixel colors were retained. No UI was drawn, generated
or reconstructed.

They show the **Expo Web demo**, not native Android, and include
only fictional room data.

## Available screenshots

| File | Screen | Mode |
|---|---|---|
| `search.png` | Search form: participants, day and time | Expo Web, demo mode |
| `results.png` | Two available demo rooms, including capacity | Expo Web, demo mode |
| `booking-form.png` | Focus Room booking form, showing passed-start-time validation (not a completed booking) | Expo Web, demo mode |
| `android-member-bookings.png` | A completed booking and *Kommende bookinger* as a Member: own booking in full, another person's as *Optaget* | Android development build, test organisation on an isolated database copy |

## Still to capture

| File | Screen | Mode |
|---|---|---|
| `organisation-panel.png` | Signed-in account and active organisation | Native development build, with a fictional test organisation and test account |

Microsoft sign-in on the Android development build is recorded in
[device-testing.md](../device-testing.md); the Expo Web images show demo mode
only and say nothing about sign-in.

The images are captures of distinct UI states, not a single successful
end-to-end booking. In the results and booking-form captures, the previous
search result is for 12:30–13:30 while the time selector shows 13:00–14:00.
The form also shows the app's warning that the earlier booking start
has passed. A completed booking is **not** pictured.

## Before committing a screenshot

- Prefer **demo mode**: its data is fictional and contains no personal data.
- Signed-in screens must use a **test account and a test organisation**. No
  real names, e-mail addresses, *Bruger-ID*s, invitation codes or links, API
  addresses other than `localhost`, or tenant or client IDs may be visible.
- Crop or clear the status bar and notifications.
- Check the image at full size before committing; Git history keeps it even
  after deletion.
