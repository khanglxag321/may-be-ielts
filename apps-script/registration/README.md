# Public registration webhook

`Code.gs` mirrors the Google Apps Script web app used by the homepage `REGISTER_API`. After changing this source, update the existing web app deployment to publish the revision.

A registration is acknowledged only after `MailApp.sendEmail` succeeds. Teachers with a configured address receive the email alongside `TEAM_EMAIL`. For teachers without a configured address, the shared team inbox receives the registration. Duplicate recipient addresses are removed.

The routing names follow the public class schedule. Add a teacher address to `TEACHER_EMAILS` when one is supplied, using the same accent-insensitive name normalization as the handler.

Run the offline checks from the repository root.

```sh
node --test apps-script/registration/registration.test.cjs
```

The tests mock Google Apps Script services. They send no emails and make no network requests.
