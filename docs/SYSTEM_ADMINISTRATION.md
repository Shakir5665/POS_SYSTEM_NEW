# System Administration

## Roles

- **Superadmin** owns the installation, can use all POS modules, manage staff accounts, control system access, and use migration tools.
- **Admin** retains the current business and settings permissions. User management and migration are reserved for Superadmin.
- **Manager** and **Cashier** retain their existing permissions.

## Provision the system owner

Apply database migrations first. Then run `npm --prefix server run superadmin:bootstrap` once with `NEXTILL_OWNER_USERNAME` and `NEXTILL_OWNER_PASSWORD` supplied to that process. The command refuses to create a second owner and stores a bcrypt hash; it does not write credentials to application source or seed data.

The owner can change their username or password from **System control**. The panel requires the current password; a new password must be at least 12 characters. Saving credentials ends other active sessions.

## Pause system access

In **System control**, choose **Pause access** and confirm. Staff logins, refreshes, and authenticated API requests are blocked while access is paused. The Superadmin can still sign in and restore access from the same panel. Requests already in progress may finish.
