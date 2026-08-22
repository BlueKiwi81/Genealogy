# Family registration and access

## Principle

Registration and authentication are separate concerns.

- A new relative **registers** by supplying first name, middle name(s), last name, date of birth, and an email address.
- Supabase Auth verifies control of that email using a passwordless one-time link/OTP flow.
- Verification does **not** grant family access.
- A family editor reviews the registration and links the login to the correct canonical `people` record.
- Returning approved relatives sign in using only their registered email and a fresh one-time link.

## Registration as family-supplied evidence

The registration record remains in `access_requests` after approval. A supplied date of birth or fuller legal name is therefore retained as family-supplied evidence even if it differs from the current canonical tree. Approval of access does not silently overwrite genealogy data.

The editor interface may suggest a likely person by comparing name and date of birth, but matching never auto-approves a user.

## Email updates

A registrant may optionally opt in to family-tree update emails. The preference is stored in `access_requests.email_updates_opt_in`. No automated notification delivery is enabled yet; a later phase should define which changes are relevant to which family member before sending notifications.

## Privacy

Date of birth and registration details are not public. The registration table is protected with Row Level Security so a registrant can read/update their own pending request and approved editors can review requests.
