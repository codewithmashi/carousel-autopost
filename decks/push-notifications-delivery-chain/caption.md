Is "send a push" one API call — or five hops?

A notification feels instant to the person who taps "send." Getting to a lock screen crosses systems you don't own:

→ The device token can be stale, rotated, or pointing at an app the user already deleted — send to a dead one and it silently vanishes.
→ APNs and FCM aren't pipes, they're gatekeepers — they queue, throttle, and drop what they don't like, with no report back to you.
→ Whether the app is even running when it arrives changes what you can do with the payload.
→ Do Not Disturb, battery optimisation, and the permission prompt are all decided by the user, per phone — no code path gets around a denial.

None of that is on the ticket that says "add push notifications." All of it is on the build.

Save this before you scope the next one.
Follow @codewithmashi — I write about the parts of a mobile build nobody puts in the estimate.

#buildinpublic #indiehackers #startupfounder #mobiledev #flutterdev #mvpbuild
