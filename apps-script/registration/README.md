# Public registration webhook

`Code.gs` mirrors the Google Apps Script web app used by the homepage `REGISTER_API`. After changing this source, update the existing web app deployment to publish the revision.

A registration is acknowledged only after `MailApp.sendEmail` succeeds. Teachers with a configured address receive the email alongside `TEAM_EMAIL`. For teachers without a configured address, the shared team inbox receives the registration. Duplicate recipient addresses are removed.

The six current teachers have configured recipient routes. Kem and Quỳnh Kem share one teacher inbox. Cici, CC and Lan Trinh share one teacher inbox. Bình An has a separate teacher inbox. Each route includes the shared team inbox, with the Hồ Bách address deduplicated because it is also `TEAM_EMAIL`. Teacher matching ignores accents, letter case and repeated spaces.

Add future teacher addresses to `TEACHER_EMAILS` using the same normalized names as the public class schedule. An unmapped future teacher still routes to the shared team inbox.

Run the offline checks from the repository root.

```sh
node --test apps-script/registration/registration.test.cjs
```

The tests mock Google Apps Script services. They send no emails and make no network requests.
