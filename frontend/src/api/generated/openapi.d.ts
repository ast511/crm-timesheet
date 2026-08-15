/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by `npm run gen:api` from the backend OpenAPI document.
 * Source: http://localhost:3000/api/docs-json
 *
 * Every request and response type in this application is derived from here.
 * Editing this file by hand makes the frontend disagree with the API it talks
 * to, which is the exact failure the generator exists to prevent — change the
 * backend contract and regenerate instead.
 */

export interface paths {
    "/api/v1": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Greeting at the root of the API
         * @description Proves the service answers at all. No padlock, and that is not an oversight: this is reached by somebody checking a URL and by whatever pings the service, neither of which has an account. It exposes a fixed sentence and nothing about anybody.
         */
        get: operations["AppController_getGreeting_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Liveness probe
         * @description No padlock, and this one is not a convenience. A liveness probe is read by a container runtime and a load balancer, which hold no credentials and restart or drain the service when the check fails — a health endpoint behind authentication is an outage that begins the moment a token expires, and it fails in the least recoverable direction. Treat the body as a public contract and keep it backwards compatible.
         */
        get: operations["HealthController_check_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in
         * @description Returns an access token and the account behind it, and sets the **refresh token as an `HttpOnly` cookie** on the response — it is deliberately not in the body, so no script on the page can read it. Present the access token as `Authorization: Bearer <accessToken>` and keep it in memory only; the browser handles the cookie by itself. A browser client must call this with `credentials: "include"` (`withCredentials: true`) or the cookie is neither stored nor sent back. **No padlock, and the route is not unprotected** — it is protected by the password in the body, and the endpoint that *issues* a token cannot require one. Answers `200` rather than `201`: a session is not a resource here, there is no `/auth/sessions/:id` to put in a `Location` header, and `201` would promise one. A wrong address, a wrong password and a deactivated account all answer `401 AUTH_INVALID_CREDENTIALS` with the same message and equalised timing — splitting them would confirm that an address exists, which in a company’s internal system also answers "does this person work here". On the strict rate-limit tier.
         */
        post: operations["AuthController_login_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rotate the refresh cookie into a new session
         * @description Reads the refresh token from the **`HttpOnly` cookie** set at login — the request takes no body — and answers with a new access token and a new refresh cookie. The body is the same as login’s, because a refresh *is* a new session: the account may have changed role in the meantime, so sending back less would leave a long-running client rendering a role it was given hours ago. **Single-use.** Presenting a spent token is treated as theft: every live session of the account is revoked, the answer is `AUTH_REFRESH_TOKEN_REUSED` rather than an ordinary expiry, and the cookie is cleared. A request carrying no cookie, or one whose value is not plausibly a token, answers the same `401 AUTH_REFRESH_TOKEN_INVALID` an unusable token does — a browser with no cookie sends no header, so there is nothing for a missing-field `400` to describe. Public at the authentication level only — the cookie is the credential. On the strict rate-limit tier.
         */
        post: operations["AuthController_refresh_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * End the session the refresh cookie belongs to
         * @description Requires **both** credentials: a valid access token, because this is an action taken by a known caller, and the refresh token — now read from the `HttpOnly` cookie — because that is the thing being revoked and the caller has more than one. The request takes no body. The service checks that the token belongs to the caller before revoking it, which is what stops an authenticated employee ending somebody else’s session. The cookie is cleared on the response whether or not one was presented, so a client whose cookie has already expired can still sign out cleanly; the route has always been idempotent and silent about what it found. Answers `200` with `data: null` rather than `204`. The access token is untouched and stays valid until it expires — a client discards it.
         */
        post: operations["AuthController_logout_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read the account behind the current token
         * @description So a frontend can hydrate its session state without decoding a token. It is also the cheapest way to ask "is my access token still good", which is why it is a `GET` with no parameters at all.
         */
        get: operations["AuthController_me_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/activate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Activate an account from an invitation link
         * @description The second half of onboarding, performed by the new user themselves: the link’s token plus the password they have chosen. Public because the caller has no account they can sign in to yet — the token *is* the credential, and requiring an access token here would mean needing a password in order to set one. Answers `data: null` rather than a session: logging the person in as a side effect of activation was considered and rejected, because a link forwarded to the wrong mailbox would then hand over a live session rather than a password prompt. An unusable link — unknown, expired, already followed, or naming an account in the wrong state — is one `400 ACCOUNT_TOKEN_INVALID` for all four cases, with `purpose` in `params`. On the strict rate-limit tier.
         */
        post: operations["AuthController_activate_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/forgot-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ask for a password-reset link
         * @description **Always answers the same thing** — the same status and the same sentence — whether the address names an active account, a pending one, a disabled one, or nobody at all. That is the no-enumeration rule, and it is why the response is a fixed message rather than anything derived from what happened. The message is returned as data rather than left to the client to invent, so every frontend says the same careful thing: one that rendered "check your inbox" unconditionally would be lying to whoever mistyped their address. On the strict rate-limit tier for a reason of its own — it *sends mail*, so an unlimited one is a way to have this company’s mail server deliver hundreds of messages to one colleague.
         */
        post: operations["AuthController_forgotPassword_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set a new password from a reset link
         * @description Public for the reason activation is: somebody who has forgotten their password cannot authenticate, which is the entire situation. **Every session the account has is revoked**, because the reason for a reset may be that somebody else has the account. Answers `data: null` and no session, for the same reason activation does. An unusable link is the same single `400 ACCOUNT_TOKEN_INVALID`. On the strict rate-limit tier.
         */
        post: operations["AuthController_resetPassword_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/change-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Change a password its owner knows
         * @description The one password route that is **not** public, and the one that asks for the current password. Both follow from the same fact: this caller is signed in, so the question is not "who are you" but "are you the person who owns this session, or somebody who found it unlocked". The account is always the caller’s own — taken from the token, never from the body — so there is no route through this API by which anybody changes another person’s password. **Every other session of the account is revoked and the current one is kept**, identified by the `HttpOnly` refresh cookie the request carries; the `refreshToken` body field this used to take was removed in Feature 040, because a client no longer holds the value. A request arriving without the cookie revokes every session including its own, which is the safe direction to be wrong in — the cost is one extra sign-in. A wrong current password is `401 ACCOUNT_CURRENT_PASSWORD_INCORRECT`, which is deliberately specific: there is no enumeration to protect against here, and the honest message is what stops somebody assuming their *new* password was rejected.
         */
        post: operations["AuthController_changePassword_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/email/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Report whether email is configured and reachable
         * @description **Always `200`, including when the connection failed**: the check succeeded in finding out that mail is broken, and the body says so. A `503` would leave a monitoring probe unable to distinguish "email is down" from "this endpoint is down". `configured` and `enabled` are two questions rather than one restated — the first is whether the environment names a mail server, the second whether this deployment may use it — and they come apart on a staging environment holding real addresses. `reason` names *which* setting is wrong without repeating the provider’s own text, which would publish a username or an internal hostname.
         */
        get: operations["EmailController_checkHealth_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/email/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send the fixed test message to one address
         * @description The message is fixed and the body is a single address. There is deliberately **no endpoint that sends caller-supplied content**: an HTTP-callable "send this HTML to this address" is an open relay wearing the company’s `From` header, and no feature needs one. Answers `200` with `data: null` — the confirmation the caller is really after arrives in their inbox.
         */
        post: operations["EmailController_sendTestEmail_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read the permission catalog
         * @description Blocked by resource so the matrix renders without a client-side reduce. `page` and `limit` select **permissions**, not groups, so `total` describes the catalog: fifty-five rows against a cap of 100 means `?limit=100` returns the whole matrix in one request. Requires `PERMISSIONS.VIEW`. There is deliberately no `POST` — the catalog is seeded vocabulary, and a permission row nothing checks would be a cell on a screen that means nothing.
         */
        get: operations["PermissionController_findAll_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/permissions/presets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read the permission presets
         * @description The quick-apply cards, each with the number of permissions it hands out and the role it is grouped under. `?targetRole=` narrows what is *shown* and not what may be *used*: a preset may be applied to any account that is not a super-admin. Requires `PERMISSIONS.VIEW`.
         */
        get: operations["PermissionController_findPresets_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/permissions/me/effective": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read my own effective permissions
         * @description **The endpoint a frontend gates its UI on** — a flat array of keys a client turns into a `Set` once and asks `has('TIMESHEET.CREATE')` of thereafter. **Deliberately not permission-gated, and it must not become so**: gating it would mean only an administrator could discover their own permissions, and every ordinary employee would get a `403` from the call whose entire purpose is to tell them what they may do. It answers about the caller alone and reveals nothing about anybody else; somebody else’s set is `GET /users/:id/permissions`, and that one *is* gated. This is soft gating — a client that skips the call and draws every button meets a real `403` on the request.
         */
        get: operations["PermissionController_findMyEffective_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{id}/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read a user’s permission matrix
         * @description Every catalog permission with whether they hold it and **why** — from their role, from an exception, or not at all. The `source` on each cell is what makes the screen usable: a tick alone cannot tell a permission somebody was *given* from one their role grants, and an untick cannot tell one that was *taken away* from one nobody ever had. A super-admin target comes back fully granted and `readOnly: true`. Requires `PERMISSIONS.VIEW`.
         */
        get: operations["UserPermissionController_findMatrix_v1"];
        /**
         * Replace a user’s permissions
         * @description **The body is the full intended matrix, not a list of changes** — which is why it is a `PUT`: the same body twice leaves the same overrides and writes no second batch of audit rows. A `PATCH` of grants and revocations would have required every client to hold a correct copy of the role baseline to compose one. The service works out where the submitted set departs from the role and stores only the difference, so the response is not always the matrix that was asked for: a submitted permission the role already grants produces no exception at all. An unknown key is a `400` naming it; a super-admin target is a `409`. Requires `PERMISSIONS.EDIT`.
         */
        put: operations["UserPermissionController_replace_v1"];
        post?: never;
        /**
         * Reset a user to their role
         * @description Clears every exception. A `DELETE` on the collection of *exceptions*, which is what this sub-resource actually stores — deleting a user’s permissions cannot mean leaving them with none, because a role always grants something. Deliberately **not** the same as `PUT { "permissionKeys": [] }`, which revokes everything the role grants: the two are opposite ends of the same axis and both are worth being able to say. Answers `200` with the resulting matrix rather than `204`, because the reset is exactly the case where the screen needs redrawing. Requires `PERMISSIONS.CONFIGURE`.
         */
        delete: operations["UserPermissionController_resetToRole_v1"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{id}/permissions/apply-preset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Apply a preset to a user
         * @description Replaces the user’s exceptions so their effective set equals the preset’s. A `POST` rather than a second `PUT`, because it is an *action* taken on the matrix rather than a statement of what the matrix should be — the same distinction that makes it write a `PRESET_APPLIED` summary row even when nothing changes. An unknown preset key is a `404`; a super-admin target is a `409`. The body is the resulting matrix, so the screen renders what the preset actually did. Requires `PERMISSIONS.CONFIGURE`.
         */
        post: operations["UserPermissionController_applyPreset_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{id}/permissions/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read a user’s permission history
         * @description Who changed this user’s permissions, what moved, and when — newest first. Each line is a *transition* rather than a snapshot, and the two summary actions (`PRESET_APPLIED`, `RESET_TO_ROLE`) carry no permission: they are headings over the per-permission lines written in the same transaction, and share their timestamp to the millisecond. Requires `PERMISSIONS.VIEW`.
         */
        get: operations["UserPermissionController_findHistory_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List accounts
         * @description Paginated, filterable and sortable. An account list is a list of everybody who can sign in and what authority each holds, which is why even the reads are ADMIN/SUPERADMIN only.
         */
        get: operations["UserController_findAll_v1"];
        put?: never;
        /**
         * Create an account and email its invitation
         * @description The account is `PENDING_ACTIVATION` and unusable when this answers: no password exists for it anywhere, including for the administrator who created it. The body accepts no `password` and the response carries no token and no hash — the activation secret travels only by email.
         */
        post: operations["UserController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read one account */
        get: operations["UserController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete an account
         * @description For an account created by mistake. Refused with a `409` while an employee is linked to it — the lifecycle action for somebody who has left is `deactivate`, and neither was repurposed into the other.
         */
        delete: operations["UserController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Update an account
         * @description A partial update of the address, the username and the role. `status` is deliberately not writable here — the three transitions below own it.
         */
        patch: operations["UserController_update_v1"];
        trace?: never;
    };
    "/api/v1/users/{id}/resend-activation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Re-send an invitation link
         * @description For an expired or lost one, and only for a `PENDING_ACTIVATION` account — an account whose owner has already activated gets a `409` carrying `ACCOUNT_NOT_PENDING_ACTIVATION` and its actual status in `params`, because what that person needs is a password reset, which is theirs to request. Issuing a new link invalidates the previous one. Answers `data: null`: the token is in an email and must not be in a response body, where a browser history, a proxy log or a screenshot would keep it.
         */
        post: operations["UserController_resendActivation_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{id}/activate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Re-enable a disabled account
         * @description **Administrative enable, not onboarding.** Moves `DISABLED → ACTIVE` and refuses `PENDING_ACTIVATION` with a `409`: an account that has never had a password cannot be made usable by flipping a state, and the only thing that activates one of those is its owner following an invitation link.
         */
        post: operations["UserController_activate_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{id}/deactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Disable an account and end its sessions
         * @description The lifecycle action for somebody who has left or whose access is being suspended. The password and every record pointing at the account survive, so it can be turned back on; what does not survive is the account’s live refresh tokens, which is what makes the disabling take effect within one access token’s lifetime rather than within a week.
         */
        post: operations["UserController_deactivate_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/departments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List departments
         * @description Paginated, filterable and sortable. Ordered by `name` by default, which is unique — so the order is total and a record can never shift between two pages of the same listing.
         */
        get: operations["DepartmentController_findAll_v1"];
        put?: never;
        /**
         * Create a department
         * @description `code` is trimmed and upper-cased before the uniqueness check, so `dev` and `DEV` are the same department.
         */
        post: operations["DepartmentController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/departments/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read one department */
        get: operations["DepartmentController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete a department
         * @description Refused with a `409` while any employee still belongs to it. Answers `200` with `data: null` rather than `204`, so a client reads the same two fields whatever it called.
         */
        delete: operations["DepartmentController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Update a department
         * @description A partial update: only the fields present in the body are changed.
         */
        patch: operations["DepartmentController_update_v1"];
        trace?: never;
    };
    "/api/v1/positions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List positions
         * @description Paginated, filterable and sortable; ordered by `name`.
         */
        get: operations["PositionController_findAll_v1"];
        put?: never;
        /**
         * Create a position
         * @description `code` is trimmed and upper-cased before the uniqueness check, so `dev` and `DEV` are the same position.
         */
        post: operations["PositionController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/positions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read one position */
        get: operations["PositionController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete a position
         * @description Refused with a `409` while any employee still holds it. Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["PositionController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Update a position
         * @description A partial update: only the fields present in the body are changed.
         */
        patch: operations["PositionController_update_v1"];
        trace?: never;
    };
    "/api/v1/employees": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List employees
         * @description Paginated, filterable and sortable. Each row carries its department, position and account summary, so a list renders without a request per employee.
         */
        get: operations["EmployeeController_findAll_v1"];
        put?: never;
        /**
         * Create an employee, optionally with a login account
         * @description Exactly one of `userId` (link an existing account) and `account` (create one) must be given — a rule about a *pair*, so it is the service’s rather than the validation pipe’s, and it answers `400`. A body carrying `account` is refused with a `403` for anybody who is not ADMIN or SUPERADMIN: creating an employee is HR’s job and creating a login is not. Without that opt-in the route is unrestricted, exactly as before Feature 036.
         */
        post: operations["EmployeeController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/employees/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read one employee */
        get: operations["EmployeeController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete an employee
         * @description Refused with a `409` while anything still depends on the record. Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["EmployeeController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Update an employee
         * @description A partial update. Moving an employee to `TERMINATED` closes their open project memberships as a side effect — see Feature 020.
         */
        patch: operations["EmployeeController_update_v1"];
        trace?: never;
    };
    "/api/v1/projects/{projectId}/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read a project’s roster
         * @description The project once, then its people — no row repeats the project the URL already named. A `404` here means the *project* does not exist; an empty roster is a `200` with an empty list.
         */
        get: operations["ProjectMembersController_findRoster_v1"];
        put?: never;
        /**
         * Add somebody to a project
         * @description The project comes from the path and only `employeeId` from the body. That is what lets an unknown *project* be a `404` — the collection is not there — while an unknown *employee* stays a `400`, because the payload is wrong.
         */
        post: operations["ProjectMembersController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{projectId}/members/{employeeId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read one membership
         * @description The person and the membership. No `project` in the payload — `:projectId` is in the URL the client just wrote.
         */
        get: operations["ProjectMembersController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Remove somebody from a project
         * @description Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["ProjectMembersController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Update a membership
         * @description A partial update of the membership period and the project-manager flag. `leftAt`, when given, must be on or after `joinedAt`.
         */
        patch: operations["ProjectMembersController_update_v1"];
        trace?: never;
    };
    "/api/v1/employees/{employeeId}/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read an employee’s project assignments
         * @description The exact mirror of a project’s roster: the employee once, then what they work on. A `404` here means the *employee* does not exist — which is what a scoped URL buys over the `?employeeId=` filter it replaced, where an unknown id honestly matched nothing and returned an empty page.
         */
        get: operations["EmployeeProjectsController_findAssignments_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List projects
         * @description Paginated, filterable and sortable.
         */
        get: operations["ProjectController_findAll_v1"];
        put?: never;
        /**
         * Create a project
         * @description `code` is trimmed and upper-cased before the uniqueness check. `endDate`, when given, must be on or after `startDate`.
         */
        post: operations["ProjectController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read one project */
        get: operations["ProjectController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete a project
         * @description Refused with a `409` while anybody is still a member of it. Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["ProjectController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Update a project
         * @description A partial update. The date ordering is re-checked against the values already stored, not only against the ones in the body.
         */
        patch: operations["ProjectController_update_v1"];
        trace?: never;
    };
    "/api/v1/profile/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read my own profile
         * @description The caller’s account plus their employment record, or `employee: null` when the account has none. **There is no `/profile/:id`** — a route that cannot name another person needs no ownership check, and this one has none because there is nothing to check. Never returns the password hash or any activation or reset token; the `select` that guarantees it is on `ProfileEntity`. This and the `PATCH` below are the two routes every authenticated caller may use, whatever their role.
         *
         *     **This is where a frontend reads the UI preferences.** `account.colorScheme` and `account.cornerRadius` are on this payload and on no other — `GET /auth/me` deliberately does not carry them, because the query behind it runs on every authenticated request and nothing authorises on a colour. Call this on load and apply both. Light/dark is not among them: the frontend keeps that locally, following the system setting.
         */
        get: operations["ProfileController_findOwn_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update my own profile
         * @description The body is whitelisted and the global pipe runs with `forbidNonWhitelisted`, so `role`, `email`, `positionId` or `employeeCode` in the payload is a `400` naming the offending property rather than a value quietly dropped — which is what makes "a user cannot smuggle a promotion into their profile update" a property of the type. **Password changes are not here**: they go through `POST /auth/change-password`, which asks for the current password first. Answers the whole profile, so a client re-renders the screen from one response.
         *
         *     Three fields: `phone`, `colorScheme` and `cornerRadius`. They span two tables — the phone is on `employees`, the two preferences on `users` — which is invisible from the wire and has one observable consequence: an account with **no employment record** may set its preferences and gets `403 AUTH_NO_EMPLOYEE_RECORD` for a phone. The refusal is raised before anything is written and the two updates are one transaction, so a rejected request changes nothing at all. An unknown enum value is a `400 VALIDATION_ERROR` naming the property.
         */
        patch: operations["ProfileController_updateOwn_v1"];
        trace?: never;
    };
    "/api/v1/work-schedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read the working schedule
         * @description **The endpoint every client needs before it renders a single timestamp.** `timezone` is the company’s IANA zone, and it is the zone every date in this API should be formatted in — not the browser’s. A `404` means no configuration has been stored yet, which is a legitimate state on a fresh deployment.
         */
        get: operations["WorkScheduleController_find_v1"];
        /**
         * Store the working schedule
         * @description `PUT` because the address is known before the resource exists, the body is complete, and sending it twice leaves the same state. Answers `200` whether it created or replaced — a `201` would let a client tell the two apart, which is exactly what this endpoint exists to spare it. `workingDays` is sorted into week order before it is stored, so the response may not echo the order that was sent.
         */
        put: operations["WorkScheduleController_save_v1"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/work-schedule/emails": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the timesheet-approval addresses
         * @description Unpaginated: the list is bounded by a configured maximum rather than by a page size.
         */
        get: operations["WorkScheduleController_findEmails_v1"];
        put?: never;
        /**
         * Add a timesheet-approval address
         * @description The address is trimmed and lower-cased before the duplicate check, so `HR@company.com` and `hr@company.com` are the same entry.
         */
        post: operations["WorkScheduleController_addEmail_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/work-schedule/emails/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Remove a timesheet-approval address
         * @description Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["WorkScheduleController_removeEmail_v1"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public-holidays": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List public holidays
         * @description The stored *definitions*, paginated. A `FIXED` holiday is one row that recurs every year; the resolved calendar for a given year is the two routes below.
         */
        get: operations["PublicHolidayController_findAll_v1"];
        put?: never;
        /**
         * Create a public holiday
         * @description Three rules are the service’s rather than the validation pipe’s, because none is about a single field in isolation: `endDate` must be on or after `startDate`, `isRecurring` must agree with `type`, and the two duplicate rules. All three answer `400`.
         */
        post: operations["PublicHolidayController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public-holidays/calendar/{year}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Resolve a year’s calendar
         * @description Every holiday that actually falls in the year, with `FIXED` definitions expanded onto it and validity ranges applied. Unpaginated — a year holds a dozen or so entries.
         */
        get: operations["PublicHolidayController_findYear_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public-holidays/calendar/{year}/{month}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Resolve a month’s calendar
         * @description The same resolution narrowed to one month. `month` is `1`–`12`; January is `1`, not `0`.
         */
        get: operations["PublicHolidayController_findMonth_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public-holidays/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read one public-holiday definition */
        get: operations["PublicHolidayController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete a public holiday
         * @description Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["PublicHolidayController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Update a public holiday
         * @description A partial update. The three cross-field rules are re-checked against the values already stored, not only against the ones in the body.
         */
        patch: operations["PublicHolidayController_update_v1"];
        trace?: never;
    };
    "/api/v1/leave-types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List leave types
         * @description The vocabulary the whole leave system uses. `icon` and `color` are here so a client draws a leave row the same way this screen does, and `reportMarker` is the one-to-three character mark a report prints for it.
         */
        get: operations["LeaveTypesController_findAll_v1"];
        put?: never;
        /**
         * Create a leave type
         * @description `code` and `reportMarker` are both trimmed and upper-cased before their uniqueness checks.
         */
        post: operations["LeaveTypesController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/leave-types/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read one leave type */
        get: operations["LeaveTypesController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete a leave type
         * @description Refused with a `409` while any balance or request still names it. Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["LeaveTypesController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Update a leave type
         * @description A partial update. Changing `defaultAllocatedDays` affects future allocations only — balances already granted are rows of their own and are not rewritten.
         */
        patch: operations["LeaveTypesController_update_v1"];
        trace?: never;
    };
    "/api/v1/leave-notification-emails": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the leave-notification addresses
         * @description Who is emailed about leave activity. A top-level collection rather than a sub-resource, because this list *is* the configuration — there is no leave-configuration row for it to hang off.
         */
        get: operations["LeaveNotificationEmailsController_findAll_v1"];
        put?: never;
        /**
         * Add a leave-notification address
         * @description The address is trimmed and lower-cased before the duplicate check.
         */
        post: operations["LeaveNotificationEmailsController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/leave-notification-emails/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Remove a leave-notification address
         * @description Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["LeaveNotificationEmailsController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Update a leave-notification address
         * @description A partial update of the address and its active flag.
         */
        patch: operations["LeaveNotificationEmailsController_update_v1"];
        trace?: never;
    };
    "/api/v1/employee-leave-balances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List leave balances
         * @description Reads *across* people — "everyone’s 2026 annual leave", sorted by employee and filtered by department — which is why this is a top-level collection rather than `/employees/:id/leave-balances`. The per-employee view is `?search=EMP-0001`. `remainingDays` is computed on every read and stored in no column.
         */
        get: operations["EmployeeLeaveBalancesController_findAll_v1"];
        put?: never;
        /**
         * Allocate a leave balance
         * @description One row per employee, leave type and year — that triple is unique, so a second allocation for the same three is a `409` rather than a silent overwrite.
         */
        post: operations["EmployeeLeaveBalancesController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/employee-leave-balances/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read one leave balance */
        get: operations["EmployeeLeaveBalancesController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete a leave balance
         * @description Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["EmployeeLeaveBalancesController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Adjust a leave balance
         * @description A partial update of the allocated, carried-over and used days. `remainingDays` is derived from those three and cannot be written.
         */
        patch: operations["EmployeeLeaveBalancesController_update_v1"];
        trace?: never;
    };
    "/api/v1/employee-leave-balances/generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Open a year for everybody in scope
         * @description Creates the balances for a year and closes the one before it, carrying over what each leave type allows. A `POST` to a named sub-path rather than a resource, because what it creates is not one balance and the response is a *report on the run* rather than a record a client could then `GET`. Answers `200` rather than `201`: a `Location` header would have nothing to point at, a re-run that creates nothing is a complete success, and `dryRun` writes nothing at all.
         */
        post: operations["EmployeeLeaveBalancesController_generate_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/leave-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List my leave requests
         * @description "Me" is the employment record of the authenticated account — there is no id in this path, which is what makes `/me` the one scope that cannot be aimed at somebody else. The payloads carry no `employee`, because a response must not repeat what the caller already stated. An account with no employment record gets a `403` carrying `AUTH_NO_EMPLOYEE_RECORD`. `requestedWorkingDays` is computed on every read from the schedule, the holidays and the span.
         */
        get: operations["MyLeaveRequestsController_findAll_v1"];
        put?: never;
        /**
         * File a leave request
         * @description The response’s `status` is `PENDING` or `APPROVED` depending on the leave type — a type that requires no approval is granted here and now, and its days leave the balance in the same transaction. At least one replacement is required: the API refuses a request with no cover. The span rules, the overlap check and the balance check are the service’s and answer `400`.
         */
        post: operations["MyLeaveRequestsController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/leave-requests/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read one of my leave requests
         * @description Somebody else’s request answers the same `404` as one that does not exist, so this endpoint cannot be used to discover that a request exists.
         */
        get: operations["MyLeaveRequestsController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Withdraw one of my leave requests
         * @description A hard delete, and only while the request is `PENDING`. A decided request is not withdrawn but cancelled, which is the approver’s action. Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["MyLeaveRequestsController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Amend one of my leave requests
         * @description Allowed only while the request is `PENDING`; once it has been decided on, it is a record of something that happened and answers `409`.
         */
        patch: operations["MyLeaveRequestsController_update_v1"];
        trace?: never;
    };
    "/api/v1/leave-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List everybody’s leave requests
         * @description The approver’s view: reads *across* people — "who is off in September", sorted by employee and narrowed by department. Defaults to the current year. Each row carries the requester and their department; `/me/leave-requests` answers the opposite question and carries neither.
         */
        get: operations["LeaveRequestsController_findAll_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/leave-requests/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read one leave request */
        get: operations["LeaveRequestsController_findOne_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/leave-requests/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Approve, refuse or cancel a request
         * @description **The only write in this API that moves another module’s data**: approving deducts the days from the employee’s balances, in the same transaction. That is why it is a sub-resource rather than a field on a general `PATCH` — folding it in would have made "did this write touch the ledger" a question about which fields the body carried. Allowed only while the request is `PENDING`; anything else is a `409`. The decider is taken from the authenticated account’s employment record, never from the body, so nobody can sign somebody else’s name to a decision.
         */
        patch: operations["LeaveRequestsController_updateStatus_v1"];
        trace?: never;
    };
    "/api/v1/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List my notifications
         * @description Notifications addressed to the caller, plus every `ALL_USERS` announcement. **Newest first** unless `?sortOrder=asc` says otherwise — the one list in this API that defaults to descending, because an inbox is a feed rather than a register.
         */
        get: operations["NotificationController_findAll_v1"];
        put?: never;
        /**
         * Create a notification (temporary, for testing)
         * @deprecated
         * @description **Temporary, and for testing only.** Notifications are produced by the Notification Delivery Engine from events the application already records; this route exists so the centre can be exercised directly and it goes away when nothing needs it.
         */
        post: operations["NotificationController_create_v1"];
        /**
         * Empty my inbox
         * @description Deletes every personal notification of the caller, read and unread alike. A `DELETE` on the collection rather than on a `.../all` sub-path: the collection is what is being emptied, and the URL says so. It answers `200` with the count rather than `204`, because "nothing was deleted" and "everything was deleted" are worth telling apart.
         */
        delete: operations["NotificationController_removeAll_v1"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/read-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Mark all my notifications read
         * @description Reports how many rows moved; `0` is a legitimate answer and means nothing was unread. **Marking an `ALL_USERS` announcement read marks it read for everybody who can see it** — there is one flag on the row, which is a property of the storage rather than of this endpoint.
         */
        patch: operations["NotificationController_markAllRead_v1"];
        trace?: never;
    };
    "/api/v1/notifications/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read one notification
         * @description Serves **both** workspaces: an id identifies a notification, not an inbox, so a client holding one does not have to know which inbox it came from to pick a URL. A notification the caller may not see answers the same `404` as one that does not exist — distinguishing them would make this endpoint a way to confirm that a message was sent.
         */
        get: operations["NotificationController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete one notification
         * @description Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["NotificationController_remove_v1"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/{id}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Mark one notification read
         * @description Sets `readAt` to the server’s clock. **Idempotent**: reading an already-read notification succeeds and moves nothing, `readAt` included, so two tabs opening one message is not an error and the timestamp keeps saying when it was *first* read.
         */
        patch: operations["NotificationController_markRead_v1"];
        trace?: never;
    };
    "/api/v1/administrative/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the administrative inbox
         * @description Notifications addressed to the caller’s role, plus every `ADMINISTRATIVE_USERS` announcement. A separate *inbox* from `/notifications`, not a wider view of it. A caller whose role is not administrative gets a `403` rather than a `404`: the workspace is not a secret, and hiding the route would send an administrator to look for a typo in the path.
         */
        get: operations["AdministrativeNotificationController_findAll_v1"];
        put?: never;
        post?: never;
        /**
         * Empty the administrative inbox
         * @description The same scoping as marking read, and it matters more here: this removes the shared `ADMINISTRATIVE_USERS` announcements for **every** administrative user, not only for the caller. The count in the response is what says how much went.
         */
        delete: operations["AdministrativeNotificationController_removeAll_v1"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/administrative/notifications/read-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Mark the administrative inbox read
         * @description "Visible to the caller" is what is marked, not "in the workspace": an HR user clearing their inbox does not mark the notifications addressed to ADMIN as read, because they never saw them. The `ADMINISTRATIVE_USERS` announcements they *do* see are marked for everybody, since there is one flag on the row.
         */
        patch: operations["AdministrativeNotificationController_markAllRead_v1"];
        trace?: never;
    };
    "/api/v1/reminders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List reminder rules
         * @description How long before a deadline people should be reminded, and by which channels. **Nothing here fires a reminder** — the Notification Delivery Engine reads this configuration and decides when a deadline is near.
         */
        get: operations["ReminderController_findAll_v1"];
        put?: never;
        /**
         * Create a reminder rule
         * @description The name is unique. A rule fires against every employee on a schedule nobody re-approves, which is why this resource is administrator-only in intent — see the feature document.
         */
        post: operations["ReminderController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reminders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read one reminder rule */
        get: operations["ReminderController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete a reminder rule
         * @description Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["ReminderController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Edit a reminder rule, or switch it off
         * @description Switching it off is `{ "enabled": false }`. There is deliberately no `POST /reminders/:id/disable`: `enabled` is a *property* of the rule rather than an event in its life, so a sub-resource would be a second way to write one column.
         */
        patch: operations["ReminderController_update_v1"];
        trace?: never;
    };
    "/api/v1/notification-campaigns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List announcement campaigns
         * @description Each row carries `recipientType` and `recipientCount` rather than the recipients themselves: resolving up to two hundred names per row would put twenty thousand nested objects on a full page to render a column that says "3 recipients". `recipientCount` is `1` for an `ALL_EMPLOYEES` campaign — that is the stored row count, not the size of the audience, which is resolved when the campaign is sent.
         */
        get: operations["NotificationCampaignController_findAll_v1"];
        put?: never;
        /**
         * Compose a campaign
         * @description **It is not sent.** No email leaves the system, no notification is written and no job is scheduled — the Notification Delivery Engine is the only thing that turns this into anything. The status is *derived* rather than accepted: a body carrying `scheduledAt` produces a `SCHEDULED` campaign, one without produces a `DRAFT`.
         */
        post: operations["NotificationCampaignController_create_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notification-campaigns/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read one campaign, with its audience
         * @description Everything the list carries, plus every recipient resolved to a person. `employee` is null on the `ALL_EMPLOYEES` entry, and that null is the point: the campaign is addressed to everybody *at the moment it is sent*, so there is no list of people to publish.
         */
        get: operations["NotificationCampaignController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete a campaign
         * @description Only one that was never sent; a `409` on one that was, because that is a record of something that happened. Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["NotificationCampaignController_remove_v1"];
        options?: never;
        head?: never;
        /**
         * Edit or cancel a campaign
         * @description Cancelling is `{ "status": "CANCELLED" }` — the one status value a client may state, because everything else about a campaign’s status is derived. A `409` on a `SENT` or `CANCELLED` campaign, naming the status: that is a statement about the state of the resource rather than about who is asking, which is why it is not a `403`.
         */
        patch: operations["NotificationCampaignController_update_v1"];
        trace?: never;
    };
    "/api/v1/notification-delivery/execute/{campaignId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send a stored campaign now
         * @description **For development and manual testing**, so the engine can be exercised without waiting for a schedule. A `DRAFT` campaign is sent as readily as a `SCHEDULED` one: this is somebody deliberately saying "send it now", and refusing a draft would mean scheduling an announcement for two minutes’ time in order to test it. Already `SENT`, `CANCELLED` or expired is a `409` naming the reason. Answers `200` rather than `201` because nothing was created — what comes back is a report of what happened: how many notifications were written, how many emails went out, and whether the mail server accepted them.
         */
        post: operations["NotificationDeliveryController_execute_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/timesheets/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read my timesheet for a month
         * @description Both `month` and `year` are required: a timesheet is one person’s account of *one* month, so "my timesheet" without a period names nothing. A `404` means the month has not been opened yet rather than that something is wrong — the client’s answer to it is `POST /timesheets/me`. Reading also brings `isStale` up to date, so the person about to edit their month is the one told that a dependency moved under it.
         */
        get: operations["TimesheetController_findOwn_v1"];
        put?: never;
        /**
         * Open my timesheet for a month
         * @description **Idempotent**: a second call for the same month returns the existing timesheet rather than a duplicate or a `409`, which the `(employee_id, month, year)` unique constraint makes a guarantee rather than an expectation — so a client may call it unconditionally instead of probing with a `GET` first. The new draft already carries the approved leave and the public holidays for the month; the employee fills in the days that are theirs. It answers `201` on the second call too, which is the one place the idempotence is visible: the body is what matters, and it is the same timesheet.
         */
        post: operations["TimesheetController_openOwn_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/timesheets/me/{id}/entries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Replace my timesheet’s lines
         * @description A `PUT` on a sub-resource rather than a `PATCH` on the timesheet, because the body is the **complete** entry set: a day omitted is a day cleared, and the same body sent twice leaves the same month. Allowed only while the timesheet is `DRAFT` or `REJECTED` — anything else is a `409` naming the status — and a `403` if it is not the caller’s. Every offending day is reported at once rather than one at a time.
         */
        put: operations["TimesheetController_setOwnEntries_v1"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/timesheets/me/{id}/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Submit my timesheet for review
         * @description `DRAFT → SUBMITTED` and `REJECTED → SUBMITTED` are the same operation and the same endpoint: resubmitting a refused month is not a different act, and the rules it must satisfy do not depend on whether somebody has already looked at it. The full validation runs here, against the calendar as it is *now*, and every offending day is reported at once.
         */
        post: operations["TimesheetController_submitOwn_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/timesheets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the review queue
         * @description **Never returns a draft**, whatever is asked for: a half-finished month is private to the person filling it in, so `?status=DRAFT` answers an empty page rather than a `400`. Each row carries the four hour figures — worked, leave, holiday and total — because that is what makes a row triageable without opening it, and it carries no entries: a page of a hundred months would otherwise be three thousand nested objects to render a table.
         */
        get: operations["TimesheetController_findAll_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/timesheets/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read one timesheet in full
         * @description The header and every line — the "see how it was filled" view the list deliberately omits. A `DRAFT` answers the same `404` as a timesheet that does not exist, so this endpoint cannot be used to discover that a colleague has started their month.
         */
        get: operations["TimesheetController_findOne_v1"];
        put?: never;
        post?: never;
        /**
         * Delete a timesheet
         * @description A `409` on an approved one: that is the record of what the company agreed somebody worked. The lines go with the header, by the cascade on their foreign key. Answers `200` with `data: null` rather than `204`.
         */
        delete: operations["TimesheetController_remove_v1"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/timesheets/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approve a submitted timesheet
         * @description **No body**, deliberately: an approval carries nothing a client could state, and an optional note would be stored as a caveat on a month that was approved without qualification. Requires the `TIMESHEET.APPROVE` permission *and* an administrative role — the gate can narrow that set but not widen it below the administrative roles. Guarded on `SUBMITTED` inside the update itself, so two administrators acting at the same moment cannot produce a month that is both approved and rejected: the second gets a `409` telling them to reload. The month is immutable afterwards, and its `scheduleSnapshot` records the rules it was judged by.
         */
        post: operations["TimesheetController_approve_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/timesheets/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reject a submitted timesheet, with a reason
         * @description The reason is **required**, which is why this transition has a body and the approval does not. It reaches the owner in the notification and is stored on the timesheet, where it survives the resubmission. Same permission, same `SUBMITTED` guard and same race protection as the approval.
         */
        post: operations["TimesheetController_reject_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the available reports
         * @description Static metadata, so no query runs. Each `description` states **which timesheet states the report counts** — the one thing a person choosing between two of them cannot infer from the title, and the one thing that makes two of these show different totals for the same month.
         */
        get: operations["ReportingController_findAll_v1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/{reportType}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Preview a report as JSON
         * @description Exactly the data model the two exports are rendered from, which is what makes an export incapable of disagreeing with the screen it was downloaded from. Answers `200` rather than the `201` Nest gives a `POST` by default, because nothing was created: this is a read whose parameters happen to travel in a body — and they do so precisely so that the preview and the export take *identical* input. An unknown `:reportType` is refused with a message naming the five valid keys before any service is entered.
         */
        post: operations["ReportingController_preview_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/{reportType}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Export a report as PDF or Excel
         * @description **The one endpoint in this API whose response is not the `{ success, data }` envelope**, and it cannot be: the body is a spreadsheet or a PDF, and there is no reading of that envelope which can contain a binary file. Rendered from the same data model the preview returns, so the two can never disagree. Nothing is written to disk — the renderers resolve with a buffer, which is streamed and then garbage-collected — and `Cache-Control: no-store` is sent because a browser serving yesterday’s file for today’s request is the one failure that would make a report quietly wrong.
         */
        post: operations["ReportingController_exportReport_v1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ErrorEnvelope: {
            /**
             * @description Always `false`. The discriminant a client branches on before it looks at
             *     anything else, including the status code.
             * @example false
             */
            success: boolean;
            /**
             * @description The HTTP status code, repeated in the body so one object carries it all.
             * @example 404
             */
            statusCode: number;
            /**
             * @description A single English explanation, or one entry per rejected field.
             *
             *     The array form is the global `ValidationPipe`'s, preserved rather than
             *     joined so a form can put each sentence back under its own input. It is
             *     written for a developer reading a log and is free to be reworded at any
             *     time — `errorCode` is the part a user interface translates against.
             * @example Public holiday not found
             */
            message: string | string[];
            /**
             * @description A stable, machine-readable identifier for what went wrong.
             *
             *     **Optional, and the absence is part of the contract.** Feature 033 added
             *     codes without rewriting the thirty modules that came before it, so an
             *     exception carrying no code produces this envelope with the key *absent*
             *     rather than present and null. A client has to handle that by falling back
             *     to `statusCode` and `message`, and that fallback is what made the migration
             *     gradual. Where a code *is* present, renaming it is a breaking change.
             * @example AUTH_UNAUTHENTICATED
             * @enum {string}
             */
            errorCode?: "INTERNAL_ERROR" | "VALIDATION_ERROR" | "RATE_LIMIT_EXCEEDED" | "AUTH_INVALID_CREDENTIALS" | "AUTH_INACTIVE_USER" | "AUTH_REFRESH_TOKEN_INVALID" | "AUTH_REFRESH_TOKEN_REUSED" | "AUTH_UNAUTHENTICATED" | "AUTH_NO_EMPLOYEE_RECORD" | "AUTHORIZATION_PERMISSION_DENIED" | "AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED" | "ACCOUNT_TOKEN_INVALID" | "ACCOUNT_NOT_PENDING_ACTIVATION" | "ACCOUNT_CURRENT_PASSWORD_INCORRECT";
            /**
             * @description Structured values for a translation to interpolate — `{ month: 9 }` behind
             *     `"Luna {{month}} este deja blocată"`.
             *
             *     Flat scalars only, and only ever present alongside an `errorCode`. Which
             *     params a code carries is documented on the code itself, in
             *     `error-codes.constants.ts`.
             * @example {
             *       "requiredPermissions": "REPORTS.VIEW",
             *       "mode": "ALL"
             *     }
             */
            params?: {
                [key: string]: string | number | boolean;
            };
            /**
             * @description The request path that produced the error, for correlating with logs.
             * @example /api/v1/public-holidays/ckv1
             */
            path: string;
            /**
             * @description ISO-8601 UTC instant at which the error was rendered.
             * @example 2026-08-12T08:36:11.816Z
             */
            timestamp: string;
        };
        GreetingResponseDto: {
            /** @description A fixed sentence. It says the service answers, and nothing about anybody. */
            message: string;
        };
        HealthResponseDto: {
            /** @description Always `ok` — the endpoint answering at all is the signal. */
            status: string;
            /** @description Which service answered, once more than one is deployed. */
            service: string;
        };
        AuthUserEntity: {
            id: string;
            email: string;
            /** @enum {string} */
            role: "SUPERADMIN" | "ADMIN" | "HR" | "USER";
            employeeId: string | null;
            administrativeAccess: boolean;
        };
        AuthSessionEntity: {
            /** @description Present as `Authorization: Bearer <accessToken>` on every other request. */
            accessToken: string;
            /** @description Always `Bearer`, so a client can build the header without knowing the scheme. */
            tokenType: string;
            /**
             * @description Seconds until `accessToken` expires — the standard OAuth 2 field, and the
             *     only number a client needs to schedule its own refresh.
             *
             *     Relative rather than an absolute instant, deliberately: it is immune to a
             *     client whose clock is wrong, which is common enough that the format exists
             *     for it. Everything else in this API sends absolute ISO-8601 timestamps
             *     because they describe *when something happened*; this describes how long
             *     something has left.
             */
            expiresIn: number;
            /** @description Who the session belongs to, so a client need not decode the token. */
            user: components["schemas"]["AuthUserEntity"];
        };
        LoginDto: {
            /**
             * Format: email
             * @description Trimmed and lower-cased before it is stored or compared.
             * @example maria.popescu@company.com
             */
            email: string;
            password: string;
        };
        ActivateAccountDto: {
            token: string;
            password: string;
        };
        PasswordResetRequestedEntity: {
            /**
             * @description The fixed sentence — see `PASSWORD_RESET_REQUESTED_MESSAGE`.
             *
             *     English, and a client is free to show its own translation instead. What it
             *     must not do is show a *different claim*: anything that asserts an email was
             *     sent turns a deliberately ambiguous answer into an account-enumeration
             *     oracle.
             */
            message: string;
        };
        ForgotPasswordDto: {
            /**
             * Format: email
             * @description Trimmed and lower-cased before it is stored or compared.
             * @example maria.popescu@company.com
             */
            email: string;
        };
        ResetPasswordDto: {
            token: string;
            newPassword: string;
        };
        ChangePasswordDto: {
            currentPassword: string;
            newPassword: string;
        };
        EmailHealthResponseDto: {
            /** @description Whether every required `SMTP_*` variable is present. */
            configured: boolean;
            /** @description Whether this instance would actually send: configured, and `SMTP_ENABLED`. */
            enabled: boolean;
            /**
             * @description The result of the connection check. Reported even when `enabled` is false,
             *     so "the credentials work, sending is switched off" is distinguishable from
             *     "nothing was ever set up".
             * @enum {string}
             */
            connection: "OK" | "FAILED" | "NOT_CONFIGURED";
            /**
             * @description Why the check failed. Present only when `connection` is `FAILED`, so its
             *     absence is not a fourth state to interpret — a client reads `connection`
             *     first and this only when it has to.
             * @enum {string}
             */
            reason?: "AUTHENTICATION_FAILED" | "CONNECTION_FAILED" | "TIMED_OUT" | "TLS_ERROR" | "UNKNOWN";
        };
        TestEmailDto: {
            /**
             * Format: email
             * @description Trimmed and lower-cased before it is stored or compared.
             * @example maria.popescu@company.com
             */
            email: string;
        };
        PermissionEntity: {
            id: string;
            /** @description `RESOURCE.ACTION` — the name a body, an audit line and a future guard quote. */
            key: string;
            /** @enum {string} */
            resource: "DASHBOARD" | "TIMESHEET" | "EMPLOYEES" | "LEAVE_REQUESTS" | "REPORTS" | "PROJECTS" | "LEAVES" | "WORK_SCHEDULE" | "PUBLIC_HOLIDAYS" | "DEPARTMENTS" | "NOTIFICATION_CONFIG" | "PERMISSIONS";
            /** @enum {string} */
            action: "PAGE_ACCESS" | "VIEW" | "CREATE" | "EDIT" | "DELETE" | "APPROVE" | "CONFIGURE";
            /** @description What the cell says on the matrix. Seeded per pair, never derived. */
            label: string;
            description: string | null;
            createdAt: string;
            updatedAt: string;
        };
        PermissionResourceGroupEntity: {
            /** @enum {string} */
            resource: "DASHBOARD" | "TIMESHEET" | "EMPLOYEES" | "LEAVE_REQUESTS" | "REPORTS" | "PROJECTS" | "LEAVES" | "WORK_SCHEDULE" | "PUBLIC_HOLIDAYS" | "DEPARTMENTS" | "NOTIFICATION_CONFIG" | "PERMISSIONS";
            /** @description The permissions of this resource **on the current page**, in page order. */
            permissions: components["schemas"]["PermissionEntity"][];
        };
        PaginationMeta: {
            /** @description 1-based index of the page returned. */
            page: number;
            /** @description Records per page that were asked for. */
            limit: number;
            /** @description Total number of records matching the query, across all pages. */
            total: number;
            /** @description Number of pages at the current `limit`; `0` when nothing matched. */
            totalPages: number;
            /** @description Whether a page exists before this one. */
            hasPreviousPage: boolean;
            /** @description Whether a page exists after this one. */
            hasNextPage: boolean;
        };
        PermissionPresetEntity: {
            id: string;
            /** @description `HR_FULL_ACCESS` — what `apply-preset` quotes. */
            key: string;
            name: string;
            description: string | null;
            /**
             * @description Which role the preset was written for, and which heading it renders under.
             * @enum {string}
             */
            targetRole: "SUPERADMIN" | "ADMIN" | "HR" | "USER";
            /** @description How many permissions the preset hands out. */
            permissionCount: number;
            createdAt: string;
            updatedAt: string;
        };
        EffectivePermissionsEntity: {
            userId: string;
            /** @enum {string} */
            role: "SUPERADMIN" | "ADMIN" | "HR" | "USER";
            /** @description `true` for a super-admin — every key, and none of them stored. */
            readOnly: boolean;
            /** @description The granted keys, in catalog order. */
            permissions: string[];
            /** @description How many, so a client renders a count without measuring the array. */
            total: number;
        };
        PermissionMatrixCell: {
            id: string;
            /** @description `RESOURCE.ACTION` — the name a body, an audit line and a future guard quote. */
            key: string;
            /** @enum {string} */
            resource: "DASHBOARD" | "TIMESHEET" | "EMPLOYEES" | "LEAVE_REQUESTS" | "REPORTS" | "PROJECTS" | "LEAVES" | "WORK_SCHEDULE" | "PUBLIC_HOLIDAYS" | "DEPARTMENTS" | "NOTIFICATION_CONFIG" | "PERMISSIONS";
            /** @enum {string} */
            action: "PAGE_ACCESS" | "VIEW" | "CREATE" | "EDIT" | "DELETE" | "APPROVE" | "CONFIGURE";
            /** @description What the cell says on the matrix. Seeded per pair, never derived. */
            label: string;
            description: string | null;
            createdAt: string;
            updatedAt: string;
            /** @description Whether the user effectively holds it. */
            granted: boolean;
            /**
             * @description Why — see {@link PERMISSION_SOURCES}.
             * @enum {string}
             */
            source: "SUPERADMIN" | "NONE" | "ROLE" | "OVERRIDE_GRANT" | "OVERRIDE_REVOKE";
        };
        PermissionMatrixResourceEntity: {
            /** @enum {string} */
            resource: "DASHBOARD" | "TIMESHEET" | "EMPLOYEES" | "LEAVE_REQUESTS" | "REPORTS" | "PROJECTS" | "LEAVES" | "WORK_SCHEDULE" | "PUBLIC_HOLIDAYS" | "DEPARTMENTS" | "NOTIFICATION_CONFIG" | "PERMISSIONS";
            permissions: components["schemas"]["PermissionMatrixCell"][];
        };
        UserPermissionMatrixEntity: {
            userId: string;
            /** @enum {string} */
            role: "SUPERADMIN" | "ADMIN" | "HR" | "USER";
            /** @description `true` for a super-admin target: the screen renders it but cannot write it. */
            readOnly: boolean;
            /** @description How many of the catalog's permissions this person effectively holds. */
            grantedCount: number;
            /** @description How many permissions the catalog holds, so a client can render "10 of 55". */
            totalCount: number;
            resources: components["schemas"]["PermissionMatrixResourceEntity"][];
        };
        SetUserPermissionsDto: {
            /**
             * @description Every permission key the user should hold, by `key` rather than by id.
             *
             *     Keys rather than ids because a key is what a screen, a feature document and
             *     a future `@RequirePermission('TIMESHEET.CREATE')` all already say. Accepting
             *     cuids would mean a client fetching the catalog purely to translate names it
             *     already knows into ids it does not, and would make a request body
             *     unreadable in a log.
             *
             *     `@IsArray()` is stated here rather than folded into `@IsPermissionKeys()`
             *     because the element rules inside it are `{ each: true }`, and
             *     class-validator silently skips those on a non-array — so without this a
             *     string body would pass validation and reach the service.
             * @example [
             *       "TIMESHEET.APPROVE",
             *       "REPORTS.VIEW"
             *     ]
             */
            permissionKeys: string[];
        };
        ApplyPresetDto: {
            /**
             * @description `HR_FULL_ACCESS` — the preset's stable key. A `404` if no preset has it.
             * @example TIMESHEET.APPROVE
             */
            presetKey: string;
        };
        AuditPermissionSummary: {
            id: string;
            key: string;
            /** @enum {string} */
            resource: "DASHBOARD" | "TIMESHEET" | "EMPLOYEES" | "LEAVE_REQUESTS" | "REPORTS" | "PROJECTS" | "LEAVES" | "WORK_SCHEDULE" | "PUBLIC_HOLIDAYS" | "DEPARTMENTS" | "NOTIFICATION_CONFIG" | "PERMISSIONS";
            /** @enum {string} */
            action: "PAGE_ACCESS" | "VIEW" | "CREATE" | "EDIT" | "DELETE" | "APPROVE" | "CONFIGURE";
            label: string;
        };
        AuditPresetSummary: {
            id: string;
            key: string;
            name: string;
        };
        AuditUserSummary: {
            id: string;
            email: string;
            username: string | null;
        };
        PermissionAuditLogEntity: {
            id: string;
            /**
             * @description What happened. The three per-permission transitions carry a `permission`;
             *     the two summaries carry none, and `PRESET_APPLIED` carries a `preset`.
             * @enum {string}
             */
            action: "PERMISSION_GRANTED" | "PERMISSION_REVOKED" | "OVERRIDE_CLEARED" | "PRESET_APPLIED" | "RESET_TO_ROLE";
            permission: components["schemas"]["AuditPermissionSummary"] | null;
            preset: components["schemas"]["AuditPresetSummary"] | null;
            /**
             * @description The override state before the change, or null when there was none.
             * @enum {string|null}
             */
            previousEffect: "GRANT" | "REVOKE" | null;
            /**
             * @description The override state after it, or null when the exception was removed.
             * @enum {string|null}
             */
            newEffect: "GRANT" | "REVOKE" | null;
            /** @description The account that made the change — from `@CurrentUser()`, never hardcoded. */
            changedBy: components["schemas"]["AuditUserSummary"];
            createdAt: string;
        };
        UserEntity: {
            id: string;
            email: string;
            username: string | null;
            /** @enum {string} */
            role: "SUPERADMIN" | "ADMIN" | "HR" | "USER";
            /**
             * @description Where the account stands in its own life.
             *
             *     **Replaced `isActive` in Feature 036**, and it is a breaking change to this
             *     resource rather than a rename: the boolean could not express
             *     `PENDING_ACTIVATION`, so a screen listing accounts had no way to show the
             *     difference between somebody who has never accepted their invitation and a
             *     colleague who has been working here for a year. See [AccountStatus] in
             *     `schema.prisma` for why one column replaced the boolean instead of sitting
             *     beside it.
             *
             *     A client that used to read `isActive` reads `status !== 'DISABLED'`, and a
             *     client that filtered `?isActive=true` filters `?status=ACTIVE`.
             * @enum {string}
             */
            status: "ACTIVE" | "PENDING_ACTIVATION" | "DISABLED";
            createdAt: string;
            updatedAt: string;
        };
        CreateUserDto: {
            /**
             * Format: email
             * @description Trimmed and lower-cased before it is stored or compared.
             * @example maria.popescu@company.com
             */
            email: string;
            /**
             * @description Trimmed; a blank string is stored as `null` rather than as "".
             * @example maria.popescu
             */
            username?: string | null;
            /** @enum {string} */
            role: "SUPERADMIN" | "ADMIN" | "HR" | "USER";
        };
        UpdateUserDto: {
            /**
             * @description Trimmed; a blank string is stored as `null` rather than as "".
             * @example maria.popescu
             */
            username?: string | null;
            /** @enum {string} */
            role?: "SUPERADMIN" | "ADMIN" | "HR" | "USER";
        };
        DepartmentEntity: {
            id: string;
            code: string;
            name: string;
            description: string | null;
            isActive: boolean;
            createdAt: string;
            updatedAt: string;
        };
        CreateDepartmentDto: {
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example IT
             */
            code: string;
            /** @example Information Technology */
            name: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            isActive?: boolean;
        };
        UpdateDepartmentDto: {
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example IT
             */
            code?: string;
            /** @example Information Technology */
            name?: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            isActive?: boolean;
        };
        PositionEntity: {
            id: string;
            code: string;
            name: string;
            description: string | null;
            isActive: boolean;
            createdAt: string;
            updatedAt: string;
        };
        CreatePositionDto: {
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example DEV
             */
            code: string;
            /** @example Software Developer */
            name: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            isActive?: boolean;
        };
        UpdatePositionDto: {
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example DEV
             */
            code?: string;
            /** @example Software Developer */
            name?: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            isActive?: boolean;
        };
        EmployeeDepartmentSummary: {
            id: string;
            code: string;
            name: string;
        };
        EmployeePositionSummary: {
            id: string;
            code: string;
            name: string;
        };
        EmployeeUserSummary: {
            id: string;
            email: string;
            username: string | null;
            /** @enum {string} */
            role: "SUPERADMIN" | "ADMIN" | "HR" | "USER";
            /** @enum {string} */
            status: "ACTIVE" | "PENDING_ACTIVATION" | "DISABLED";
        };
        EmployeeEntity: {
            id: string;
            employeeCode: string;
            firstName: string;
            lastName: string;
            phone: string | null;
            hireDate: string;
            /**
             * @description The day the person left, or `null` while they still work here.
             *
             *     Added by Feature 030, which bounds a timesheet's entries at
             *     `[hireDate, terminationDate ?? today]`. Independent of `status` — somebody
             *     serving notice is `ACTIVE` and has a termination date — so a client renders
             *     both rather than deriving one from the other.
             */
            terminationDate: string | null;
            /** @enum {string} */
            seniority: "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD";
            /** @enum {string} */
            status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TERMINATED";
            canReplaceOthers: boolean;
            department: components["schemas"]["EmployeeDepartmentSummary"];
            position: components["schemas"]["EmployeePositionSummary"];
            user: components["schemas"]["EmployeeUserSummary"];
            createdAt: string;
            updatedAt: string;
        };
        CreateEmployeeDto: {
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example EMP-0001
             */
            employeeCode: string;
            /** @example Ștefan */
            firstName: string;
            /** @example Ștefan */
            lastName: string;
            /**
             * @description Trimmed; a blank string is stored as `null`. No format check — the column holds whatever a person typed, in whichever national convention.
             * @example +40 721 000 000
             */
            phone?: string | null;
            /** @example 2026-09-01T00:00:00.000Z */
            hireDate: string;
            /**
             * @description The last day the person works here, when that is already known.
             *
             *     Optional, and null on almost every employee — somebody being hired does not
             *     usually have a leaving date. It is accepted at creation anyway, because a
             *     fixed-term contract is entered with both ends known, and requiring a second
             *     `PATCH` to state a fact the form already had would be ceremony.
             *
             *     Added by Feature 030, which is the first thing here that reads it: a
             *     timesheet entry is only acceptable inside
             *     `[hireDate, terminationDate ?? today]`, so a leaver's final month can be
             *     filled up to the day they left and no further.
             *
             *     That it must not precede `hireDate` is a rule about two fields at once, so it
             *     is checked in the service beside the other statements about what a valid
             *     employee is.
             * @example 2026-09-01T00:00:00.000Z
             */
            terminationDate?: string | null;
            /**
             * @description The existing account this employee signs in with.
             *
             *     **Optional as of Feature 036, and exactly one of `userId` / `account` must be
             *     given.** The service enforces that pair rule, because "neither" and "both"
             *     are both mistakes and only a rule about two fields at once can say so.
             *
             *     `Employee.userId` is still a required, unique column — an employee always has
             *     exactly one account — so this is not a step towards employees without logins.
             *     It is a choice about *which* account: one that already exists, or one created
             *     in the same breath.
             * @example clv8k2x9b000008l3fh7g2n1q
             */
            userId?: string;
            /** @example clv8k2x9b000008l3fh7g2n1q */
            departmentId: string;
            /** @example clv8k2x9b000008l3fh7g2n1q */
            positionId: string;
            /**
             * @description Create the login alongside the employee — the "checkbox on the Employees
             *     page" flow, and the common case.
             *
             *     Supplying this creates a `PENDING_ACTIVATION` account and emails the person
             *     an activation link, in the same transaction that creates their employee
             *     record. It reuses `CreateUserDto` wholesale rather than restating `email`,
             *     `username` and `role`, so the account created here and the one created by
             *     `POST /users` cannot acquire different validation — and so that a `password`
             *     smuggled in through this nested object is rejected exactly as it is there.
             *
             *     **Nested validation needs both decorators.** `@ValidateNested()` tells
             *     class-validator to descend, and `@Type()` tells class-transformer what to
             *     instantiate; without the second the payload stays a plain object and *no*
             *     rule inside it runs, which is the failure mode where an unvalidated email
             *     reaches the database. Whitelisting descends too, so an unknown key inside
             *     `account` is a `400` like one at the top level.
             *
             *     **Only `ADMIN` and `SUPERADMIN` may use it.** Creating an employee is HR's
             *     job; creating a login is not, and the same request may do both — which is
             *     precisely why that check is in the service against `@CurrentUser()` rather
             *     than a gate on the route. An HR user sending this gets a `403` and no
             *     employee; the fix is to omit it and let an administrator create the account.
             */
            account?: components["schemas"]["CreateUserDto"];
            /** @enum {string} */
            seniority: "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD";
            /** @enum {string} */
            status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TERMINATED";
            /**
             * @description Omitted, the schema's `false` applies. `null` is not the same request and
             *     is rejected — the column is not nullable, so it has nothing to store.
             */
            canReplaceOthers?: boolean;
        };
        UpdateEmployeeDto: {
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example EMP-0001
             */
            employeeCode?: string;
            /** @example Ștefan */
            firstName?: string;
            /** @example Ștefan */
            lastName?: string;
            /**
             * @description Trimmed; a blank string is stored as `null`. No format check — the column holds whatever a person typed, in whichever national convention.
             * @example +40 721 000 000
             */
            phone?: string | null;
            /** @example 2026-09-01T00:00:00.000Z */
            hireDate?: string;
            /**
             * @description The day the person left, or `null` to say they did not after all.
             *
             *     The second nullable column, and the second field where `null` is a value
             *     rather than a mistake: a termination entered by accident, or a leaver who
             *     withdrew their notice, has to be undoable, and `@ValidateIfPresent()` would
             *     have made that a `400`.
             *
             *     Setting it does **not** set `status`, and setting `status` to `TERMINATED`
             *     does not set this. The two are deliberately independent — see the schema
             *     comment on the column — because a notice period is real: somebody whose last
             *     day is in three weeks is `ACTIVE` and has a termination date, and coupling
             *     the two would either terminate them early or refuse to record the date.
             * @example 2026-09-01T00:00:00.000Z
             */
            terminationDate?: string | null;
            /** @example clv8k2x9b000008l3fh7g2n1q */
            userId?: string;
            /** @example clv8k2x9b000008l3fh7g2n1q */
            departmentId?: string;
            /** @example clv8k2x9b000008l3fh7g2n1q */
            positionId?: string;
            /** @enum {string} */
            seniority?: "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD";
            /** @enum {string} */
            status?: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TERMINATED";
            canReplaceOthers?: boolean;
        };
        ProjectEntity: {
            id: string;
            code: string;
            name: string;
            clientName: string;
            description: string | null;
            estimatedHours: number;
            color: string | null;
            /** @enum {string} */
            projectStatus: "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
            /** @enum {string} */
            projectPriority: "MEDIUM" | "LOW" | "HIGH";
            isArchived: boolean;
            startDate: string | null;
            endDate: string | null;
            createdAt: string;
            updatedAt: string;
        };
        ProjectMemberEmployeeSummary: {
            id: string;
            employeeCode: string;
            firstName: string;
            lastName: string;
            /** @enum {string} */
            seniority: "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD";
            /** @enum {string} */
            status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TERMINATED";
            department: components["schemas"]["EmployeeDepartmentSummary"];
            position: components["schemas"]["EmployeePositionSummary"];
        };
        ProjectMemberRosterEntry: {
            employee: components["schemas"]["ProjectMemberEmployeeSummary"];
            isProjectManager: boolean;
            joinedAt: string;
            leftAt: string | null;
        };
        ProjectRosterEntity: {
            project: components["schemas"]["ProjectEntity"];
            members: components["schemas"]["ProjectMemberRosterEntry"][];
            meta: components["schemas"]["PaginationMeta"];
        };
        CreateProjectMemberDto: {
            /** @example clv8k2x9b000008l3fh7g2n1q */
            employeeId: string;
            /**
             * @description When the person joined. Optional, because "now" is the honest answer for a
             *     membership created as it happens; a backdated one states its own date.
             *
             *     `null` is rejected for the same reason as `isProjectManager`. Note that an
             *     omission is resolved to the current time *by the service* rather than by
             *     the column's `@default(now())` — see `ProjectMemberService.create`.
             * @example 2026-09-01T00:00:00.000Z
             */
            joinedAt?: string;
            /**
             * @description When the person left, and the one nullable column on the table.
             *
             *     A membership created with a `leftAt` is a historical one being recorded
             *     after the fact — an import, or a backfill of who worked on a project last
             *     year — which is why this is accepted on creation rather than only on the
             *     `PATCH` that ends an active membership.
             * @example 2026-09-01T00:00:00.000Z
             */
            leftAt?: string | null;
            /**
             * @description Omitted, the schema's `false` applies — most members are not the manager.
             *     `null` is not the same request and is rejected: the column is not nullable,
             *     so it has nothing to store.
             */
            isProjectManager?: boolean;
        };
        UpdateProjectMemberDto: {
            /**
             * @description Corrects the join date; `null` is rejected, the column cannot hold it.
             * @example 2026-09-01T00:00:00.000Z
             */
            joinedAt?: string;
            /**
             * @description Ends the membership — and, as `null`, reopens it.
             *
             *     This is the whole lifecycle of a membership: setting `leftAt` makes it
             *     inactive without deleting the history, and clearing it back to `null` is
             *     how somebody rejoins a project they had left. The composite primary key
             *     means a second row for the same pair is impossible, so reopening this one
             *     is the *only* way to express a return.
             * @example 2026-09-01T00:00:00.000Z
             */
            leftAt?: string | null;
            /**
             * @description Promotes or demotes the member.
             *
             *     Nothing here enforces one manager per project. The schema does not, the
             *     feature did not ask for it, and a rule invented in a `PATCH` handler is a
             *     policy nobody can see — a project with two leads, or with none between one
             *     person leaving and the next being named, is a situation this module records
             *     rather than prevents.
             */
            isProjectManager?: boolean;
        };
        ProjectMemberProjectSummary: {
            id: string;
            code: string;
            name: string;
            clientName: string;
            color: string | null;
        };
        ProjectMemberAssignmentEntry: {
            project: components["schemas"]["ProjectMemberProjectSummary"];
            isProjectManager: boolean;
            joinedAt: string;
            leftAt: string | null;
        };
        EmployeeProjectsEntity: {
            employee: components["schemas"]["EmployeeEntity"];
            projects: components["schemas"]["ProjectMemberAssignmentEntry"][];
            meta: components["schemas"]["PaginationMeta"];
        };
        CreateProjectDto: {
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example CRM-TS
             */
            code: string;
            /** @example CRM TimeSheet */
            name: string;
            /** @example TechCorp Solutions */
            clientName: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            /** @example 1200 */
            estimatedHours: number;
            /**
             * @description Trimmed and upper-cased; a blank string is stored as `null`.
             * @example #3B82F6
             */
            color?: string | null;
            /**
             * @description A project may be planned before its dates are known; both are nullable.
             * @example 2026-09-01T00:00:00.000Z
             */
            startDate?: string | null;
            /** @example 2026-09-01T00:00:00.000Z */
            endDate?: string | null;
            /**
             * @description Omitted, the schema's `false` applies. `null` is not the same request and
             *     is rejected — the column is not nullable, so it has nothing to store.
             */
            isArchived?: boolean;
            /**
             * @description Omitted, the schema's `ACTIVE` applies; `null` is rejected, as above.
             * @enum {string}
             */
            projectStatus?: "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
            /**
             * @description Omitted, the schema's `MEDIUM` applies; `null` is rejected, as above.
             * @enum {string}
             */
            projectPriority?: "MEDIUM" | "LOW" | "HIGH";
        };
        UpdateProjectDto: {
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example CRM-TS
             */
            code?: string;
            /** @example CRM TimeSheet */
            name?: string;
            /** @example TechCorp Solutions */
            clientName?: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            /** @example 1200 */
            estimatedHours?: number;
            /**
             * @description Trimmed and upper-cased; a blank string is stored as `null`.
             * @example #3B82F6
             */
            color?: string | null;
            /**
             * @description Nullable, and the reason the service resolves the range rather than reading
             *     it off this object: patching only `endDate` has to be compared against the
             *     `startDate` already stored, and clearing `startDate` has to lift the
             *     constraint instead of failing against a value that is no longer there.
             * @example 2026-09-01T00:00:00.000Z
             */
            startDate?: string | null;
            /** @example 2026-09-01T00:00:00.000Z */
            endDate?: string | null;
            isArchived?: boolean;
            /**
             * @description Free to move in any direction. A cancelled project can be reopened and a
             *     completed one reclassified — this module records the state somebody chose,
             *     it does not police the transitions between them. A lifecycle state machine
             *     is a policy decision, and one nobody has asked for yet.
             * @enum {string}
             */
            projectStatus?: "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
            /** @enum {string} */
            projectPriority?: "MEDIUM" | "LOW" | "HIGH";
        };
        ProfileAccount: {
            /**
             * @description The palette this person chose — one of the application's eight themes.
             *
             *     **This endpoint is where a frontend reads it**, on load, and it is the only
             *     place the API sends it. `GET /auth/me` deliberately does not carry it; the
             *     argument is in `ProfileController`, and the short version is that the query
             *     behind `/auth/me` runs on every authenticated request and is not the place to
             *     add two columns nothing authenticates with.
             *
             *     Changed through `PATCH /profile/me`, like every other writable field here.
             *
             *     The `enum` is stated rather than left to the Swagger plugin's inference —
             *     see {@link ProfileAccount.cornerRadius}, where leaving it cost the document
             *     its order.
             * @example VIOLET
             * @enum {string}
             */
            colorScheme: "DEFAULT" | "RED" | "ROSE" | "ORANGE" | "GREEN" | "BLUE" | "YELLOW" | "VIOLET";
            /**
             * @description How rounded this person wants the corners — a symbol, not a number.
             *
             *     The five members map onto CSS radii, and **the frontend owns the mapping**:
             *     `NONE` = `0rem`, `SMALL` = `0.3rem`, `MEDIUM` = `0.5rem` (the default),
             *     `LARGE` = `0.75rem`, `FULL` = `1rem`. The API never sends the number — see
             *     [UiCornerRadius] in `schema.prisma` for why storing one was rejected.
             *
             *     **The `enum` is passed explicitly, and it has to be.** Everywhere else in
             *     this application the Swagger plugin infers an enum from the field's type and
             *     gets the declaration order right; for this one it did not, and published
             *     `NONE, MEDIUM, SMALL, LARGE, FULL` — a scale with its middle two rungs
             *     swapped, which a settings screen generated from the document would have
             *     rendered in that order. Handing it the runtime enum object instead of a
             *     type-only reference makes the order the schema's, not the type checker's.
             * @example LARGE
             * @enum {string}
             */
            cornerRadius: "NONE" | "SMALL" | "MEDIUM" | "LARGE" | "FULL";
            id: string;
            email: string;
            username: string | null;
            /** @enum {string} */
            role: "SUPERADMIN" | "ADMIN" | "HR" | "USER";
            /** @enum {string} */
            status: "ACTIVE" | "PENDING_ACTIVATION" | "DISABLED";
            createdAt: string;
        };
        ProfileEmployee: {
            id: string;
            employeeCode: string;
            firstName: string;
            lastName: string;
            /** @description The one field of *this half* `PATCH /profile/me` may change. */
            phone: string | null;
            hireDate: string;
            terminationDate: string | null;
            /** @enum {string} */
            seniority: "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD";
            /** @enum {string} */
            status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TERMINATED";
            department: {
                id: string;
                code: string;
                name: string;
            };
            position: {
                id: string;
                code: string;
                name: string;
            };
        };
        ProfileEntity: {
            account: components["schemas"]["ProfileAccount"];
            /** @description `null` for an account with no employment record — a system super-admin. */
            employee: components["schemas"]["ProfileEmployee"] | null;
        };
        UpdateProfileDto: {
            /**
             * @description Trimmed; a blank string is stored as `null`. No format check — the column holds whatever a person typed, in whichever national convention.
             * @example +40 721 000 000
             */
            phone?: string | null;
            /**
             * @description One of the application’s eight fixed palettes. `DEFAULT` is the standard theme rather than the absence of a choice, so there is no null. Light and dark are **not** here — the frontend keeps that locally, following the system setting.
             * @example VIOLET
             * @enum {string}
             */
            colorScheme?: "DEFAULT" | "RED" | "ROSE" | "ORANGE" | "GREEN" | "BLUE" | "YELLOW" | "VIOLET";
            /**
             * @description How rounded the corners are, as one of five symbols. The frontend maps them to CSS: `NONE` = `0rem`, `SMALL` = `0.3rem`, `MEDIUM` = `0.5rem` (the default), `LARGE` = `0.75rem`, `FULL` = `1rem`. The number is never sent — the enum is what keeps the value one of the five that exist.
             * @example LARGE
             * @enum {string}
             */
            cornerRadius?: "NONE" | "SMALL" | "MEDIUM" | "LARGE" | "FULL";
        };
        WorkScheduleEntity: {
            workingDays: ("MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY")[];
            /**
             * @description Which weekday a working week begins on. Added by Feature 030, which is the
             *     first consumer that has to group days into weeks — see the schema comment on
             *     the column for why it is configured rather than assumed.
             * @enum {string}
             */
            weekStartsOn: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
            workStartTime: string;
            workEndTime: string;
            /**
             * @description The IANA zone the two wall-clock times above, and every calendar day in the
             *     application, are read in. Published so a client can show the current value
             *     and pre-fill the editor — without it the field would be writable through the
             *     `PUT` and invisible to the form that has to send it back.
             */
            timezone: string;
            minHoursPerEntry: number;
            maxHoursPerEntry: number;
            maxHoursPerDay: number;
            standardHoursPerDay: number;
            standardHoursPerWeek: number;
            /** @description Recorded, published, and subtracted from nothing. See the module doc. */
            lunchBreakHours: number;
            createdAt: string;
            updatedAt: string;
        };
        UpdateWorkScheduleDto: {
            workingDays: ("MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY")[][];
            /**
             * @description An IANA timezone name. This is the zone every client should render this API’s timestamps in.
             * @example Europe/Bucharest
             */
            timezone?: string;
            /**
             * @description `09:00` — when the office opens.
             * @example 09:00
             */
            workStartTime: string;
            /**
             * @description `18:00` — when it closes. May be earlier than the start; see the rule.
             * @example 09:00
             */
            workEndTime: string;
            /**
             * @description The smallest bookable entry, `0.5` for half an hour.
             * @example 8
             */
            minHoursPerEntry: number;
            /**
             * @description The largest single entry. Must exceed `minHoursPerEntry`.
             * @example 8
             */
            maxHoursPerEntry: number;
            /**
             * @description The ceiling across every entry on one day.
             * @example 8
             */
            maxHoursPerDay: number;
            /**
             * @description What a full day is expected to add up to.
             * @example 8
             */
            standardHoursPerDay: number;
            /**
             * @description What a full week is expected to add up to.
             * @example 8
             */
            standardHoursPerWeek: number;
            /**
             * @description The company's lunch break, in hours. `0` is a valid answer.
             *
             *     Recorded only. Nothing subtracts it, and the Timesheets module will ignore
             *     it — see the note on `WorkScheduleService`.
             * @example 1
             */
            lunchBreakHours: number;
            /**
             * @description Which weekday the working week begins on. Defaults to `MONDAY`.
             *
             *     **Optional**, which is a deliberate exception to the "every field is
             *     required" rule above, and the exception is the migration rather than the
             *     design: this column arrived with Feature 030, and a `PUT` written against the
             *     previous contract must not start failing because a field nobody knew about is
             *     now compulsory. The initialiser supplies what the column defaults to, so an
             *     old body and a new one store the same thing.
             *
             *     {@link timezone} is optional for the same migration reason and behaves
             *     differently on omission — it is left unchanged rather than reset to a
             *     default. See its own note for why the two answers differ.
             *
             *     It is configuration and not a constant because the working week does not
             *     begin on Monday everywhere this application may be deployed — Sunday is the
             *     first working day across much of the Middle East and in parts of Asia and the
             *     Americas. It is read only by the Timesheets module's *weekly* hour ceiling,
             *     which has to know where one week ends and the next begins; a Monday assumed
             *     in that grouping would split such a company's week in two and let the ceiling
             *     be exceeded without anything noticing.
             *
             *     It is independent of {@link workingDays} and cannot be derived from it: a
             *     company working Sunday to Thursday and one working Tuesday to Saturday both
             *     have a first *listed* day that says nothing about which day their week turns
             *     over on.
             * @default MONDAY
             * @enum {string}
             */
            weekStartsOn: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
        };
        TimesheetApprovalEmailEntity: {
            id: string;
            email: string;
            createdAt: string;
        };
        CreateTimesheetApprovalEmailDto: {
            /**
             * Format: email
             * @description Trimmed and lower-cased before it is stored or compared.
             * @example maria.popescu@company.com
             */
            email: string;
        };
        PublicHolidayEntity: {
            id: string;
            name: string;
            description: string | null;
            /** @enum {string} */
            type: "FIXED" | "VARIABLE";
            isNational: boolean;
            validFromYear: number | null;
            validToYear: number | null;
            startDate: string;
            endDate: string;
            isRecurring: boolean;
            createdAt: string;
            updatedAt: string;
        };
        PublicHolidayOccurrenceEntity: {
            id: string;
            name: string;
            description: string | null;
            /** @enum {string} */
            type: "FIXED" | "VARIABLE";
            isNational: boolean;
            startDate: string;
            endDate: string;
        };
        CreatePublicHolidayDto: {
            /** @example Ziua Națională */
            name: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            /**
             * @description The years this version applies to, both ends inclusive and both optional.
             *
             *     Omitting them — the common case — creates a holiday that has always applied
             *     and still does, which is what entering a holiday normally means. They are
             *     for the two cases a flag could not express: a holiday introduced in a known
             *     year, and one that has already been repealed.
             *
             *     `FIXED` only. On a `VARIABLE` holiday either of them is a `400`: that row
             *     already *is* one year, named by `startDate`, and a range on it would be a
             *     second statement of the same fact that could disagree with the first.
             * @example 2026
             */
            validFromYear?: number | null;
            /** @example 2026 */
            validToYear?: number | null;
            /**
             * @description Both ends of the span, inclusive.
             *
             *     For a `FIXED` holiday the year is disregarded by the recurrence rule but is
             *     still stored — a `timestamp` column has no way to hold a month and a day
             *     alone, and inventing a sentinel year would be a value every reader has to
             *     know about.
             * @example 2026-09-01T00:00:00.000Z
             */
            startDate: string;
            /** @example 2026-09-01T00:00:00.000Z */
            endDate: string;
            /**
             * @description Required, and it is the field the rest of the record is judged against:
             *     it decides whether the year in `startDate` means anything and which
             *     duplicate rule applies.
             * @enum {string}
             */
            type: "FIXED" | "VARIABLE";
            /**
             * @description Omitted, the schema's `true` applies; `null` is rejected — the column is
             *     not nullable, so it has nothing to store.
             */
            isNational?: boolean;
            /**
             * @description Optional, and redundant when sent: recurrence follows from `type`, so the
             *     service derives it (`FIXED` → `true`, `VARIABLE` → `false`) and stores the
             *     derived value.
             *
             *     It is accepted anyway so a client can state the invariant explicitly — and
             *     a value that contradicts `type` is a `400` rather than something quietly
             *     overwritten, which is the point of accepting it at all.
             */
            isRecurring?: boolean;
        };
        UpdatePublicHolidayDto: {
            /** @example Ziua Națională */
            name?: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            /**
             * @description The two ends of the validity range, each nullable so it can be re-opened.
             *
             *     `{ "validToYear": 2026 }` is how a holiday is repealed: it applied through
             *     2026 and does not afterwards. `{ "validToYear": null }` undoes that, for a
             *     repeal entered by mistake — reinstating a holiday that genuinely came back
             *     is a new version instead, so the years it was absent stay absent.
             * @example 2026
             */
            validFromYear?: number | null;
            /** @example 2026 */
            validToYear?: number | null;
            /**
             * @description Either end may be moved on its own, which is why the service resolves the
             *     span rather than reading it off this object: a body carrying only `endDate`
             *     has to be compared against the `startDate` already stored.
             * @example 2026-09-01T00:00:00.000Z
             */
            startDate?: string;
            /** @example 2026-09-01T00:00:00.000Z */
            endDate?: string;
            /** @enum {string} */
            type?: "FIXED" | "VARIABLE";
            isNational?: boolean;
            /**
             * @description Redundant when sent, exactly as on create: the service derives recurrence
             *     from the resolved `type` and rejects a value that contradicts it.
             */
            isRecurring?: boolean;
        };
        LeaveTypeEntity: {
            id: string;
            code: string;
            label: string;
            /**
             * @description The one-to-three character glyph a report grid prints for a day of this
             *     leave — `C`, `M`, `S`. Unique across leave types, so a legend never lists
             *     one marker twice. Added by Feature 031.
             */
            reportMarker: string;
            icon: string;
            color: string | null;
            description: string | null;
            defaultAllocatedDays: number | null;
            /** @description Whether a year's remainder may still be taken in the next year. */
            allowsCarryOver: boolean;
            /** @description The ceiling on that remainder; `null` means no ceiling. */
            maxCarryOverDays: number | null;
            requiresApproval: boolean;
            isPaid: boolean;
            isActive: boolean;
            createdAt: string;
            updatedAt: string;
        };
        CreateLeaveTypeDto: {
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example ANNUAL
             */
            code: string;
            /** @example Concediu de odihnă */
            label: string;
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example CO
             */
            reportMarker: string;
            /** @example beach_access */
            icon: string;
            /**
             * @description Trimmed and upper-cased; a blank string is stored as `null`.
             * @example #22C55E
             */
            color?: string | null;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            /**
             * @description A suggestion for the form HR fills in when it grants this leave, never an
             *     allocation. Omitting it — or sending `null` — says the type suggests
             *     nothing, which is what medical leave granted against a certificate does;
             *     `0` would instead claim a suggestion of zero days.
             * @example 21
             */
            defaultAllocatedDays?: number | null;
            /**
             * @description The ceiling on what survives one year-end. Omitting it — or sending `null` —
             *     means no ceiling, which is a different policy from a ceiling of `0`.
             *
             *     Read only when `allowsCarryOver` is `true`; on a type that carries nothing
             *     over it bounds something that never happens.
             * @example 5
             */
            maxCarryOverDays?: number | null;
            /**
             * @description Whether days left at the end of a year may still be taken in the next one.
             *
             *     Left to the schema's `false` default rather than repeated here, which is the
             *     conservative direction: a type carries nothing over until somebody says it
             *     does. Annual leave is what this is for; medical leave is granted against a
             *     certificate, so there is nothing to carry.
             */
            allowsCarryOver?: boolean;
            requiresApproval?: boolean;
            isPaid?: boolean;
            isActive?: boolean;
        };
        UpdateLeaveTypeDto: {
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example ANNUAL
             */
            code?: string;
            /** @example Concediu de odihnă */
            label?: string;
            /**
             * @description Trimmed and upper-cased before it is stored or compared.
             * @example CO
             */
            reportMarker?: string;
            /** @example beach_access */
            icon?: string;
            /**
             * @description Trimmed and upper-cased; a blank string is stored as `null`.
             * @example #22C55E
             */
            color?: string | null;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            /**
             * @description Nullable: `null` withdraws the suggestion entirely, which is a different
             *     request from `0` — "suggest no days" — and both are accepted.
             *
             *     Changing it moves the number a future form is pre-filled with. It rewrites
             *     no allocation anybody has already been granted, because this feature grants
             *     none: the balances are a table the Leave Balances feature owns.
             * @example 21
             */
            defaultAllocatedDays?: number | null;
            /**
             * @description Nullable: `null` removes the ceiling entirely, which is a different request
             *     from `0` — "carry over, but no days" — and both are accepted.
             * @example 5
             */
            maxCarryOverDays?: number | null;
            /**
             * @description Turning this on does not retroactively rescue days an earlier year-end
             *     already expired, and turning it off does not reclaim days that survived one.
             *     Both are true for the same reason: the policy is read once, when a year is
             *     generated, and what it decided is recorded in that year's `expiredDays`.
             */
            allowsCarryOver?: boolean;
            requiresApproval?: boolean;
            isPaid?: boolean;
            isActive?: boolean;
        };
        LeaveNotificationEmailEntity: {
            id: string;
            email: string;
            createdAt: string;
            updatedAt: string;
        };
        CreateLeaveNotificationEmailDto: {
            /**
             * Format: email
             * @description Trimmed and lower-cased before it is stored or compared.
             * @example maria.popescu@company.com
             */
            email: string;
        };
        UpdateLeaveNotificationEmailDto: {
            /**
             * Format: email
             * @description Trimmed and lower-cased before it is stored or compared.
             * @example maria.popescu@company.com
             */
            email?: string;
        };
        BalanceDepartmentSummary: {
            id: string;
            code: string;
            name: string;
        };
        BalanceEmployeeSummary: {
            id: string;
            employeeCode: string;
            firstName: string;
            lastName: string;
            department: components["schemas"]["BalanceDepartmentSummary"];
        };
        BalanceLeaveTypeSummary: {
            id: string;
            code: string;
            label: string;
            icon: string;
            color: string | null;
        };
        EmployeeLeaveBalanceEntity: {
            id: string;
            employee: components["schemas"]["BalanceEmployeeSummary"];
            leaveType: components["schemas"]["BalanceLeaveTypeSummary"];
            year: number;
            allocatedDays: number;
            carriedOverDays: number;
            usedDays: number;
            /** @description Days written off at a year-end by the leave type's carry-over policy. */
            expiredDays: number;
            /** @description Derived, never stored. `allocated + carriedOver - used - expired`. */
            remainingDays: number;
            notes: string | null;
            createdAt: string;
            updatedAt: string;
        };
        CreateEmployeeLeaveBalanceDto: {
            /** @example clv8k2x9b000008l3fh7g2n1q */
            employeeId: string;
            /** @example clv8k2x9b000008l3fh7g2n1q */
            leaveTypeId: string;
            /** @example 2026 */
            year: number;
            /** @example 21 */
            allocatedDays: number;
            /**
             * @description Omitted, the schema's `0` applies — the right answer for a first year.
             * @example 21
             */
            carriedOverDays?: number;
            /**
             * @description Omitted, the schema's `0` applies.
             *
             *     Statable on creation rather than forced to zero, because a balance is not
             *     always opened at the start of a year: somebody joining mid-year, or a
             *     migration from whatever HR used before, arrives with days already taken.
             * @example 21
             */
            usedDays?: number;
            /**
             * @description Omitted, the schema's `0` applies — which is what a balance being opened
             *     should almost always say.
             *
             *     Accepted here only for the same reason `usedDays` is: a balance migrated
             *     from whatever HR used before may arrive with days already written off, and
             *     refusing the field would make that year unrecordable. Ordinary year-end
             *     expiry is written by the generation endpoint, not typed.
             * @example 21
             */
            expiredDays?: number;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            notes?: string | null;
        };
        LeaveBalanceGenerationReport: {
            /** @description The year that was opened — the `year` from the request, echoed once. */
            year: number;
            /**
             * @description Balances written. `0` on a `dryRun`, and `0` on a re-run that found
             *     everything already in place — which are different situations that
             *     {@link dryRun} and {@link skipped} tell apart.
             */
            created: number;
            /**
             * @description Balances left alone because the employee already held one for this type and
             *     year.
             *
             *     The number that makes the endpoint re-runnable in practice: HR runs it in
             *     December, three people are hired in January, and the second run reports the
             *     first run's rows here rather than failing on them.
             */
            skipped: number;
            /**
             * @description Days written off across the previous year's balances by the carry-over
             *     policy.
             *
             *     Reported because it is the only destructive thing a run does. A number far
             *     larger than expected is how somebody notices that a leave type is missing
             *     its `allowsCarryOver` flag — before the employees do.
             */
            expiredFromPreviousYear: number;
            /** @description Balances whose previous year was capped; the rows behind the count above. */
            expiredBalances: number;
            /**
             * @description Whether this was a preview. `true` means nothing above was written.
             *
             *     Echoed rather than left implicit so a report saved, pasted or logged still
             *     says what it was — the counts alone cannot distinguish a preview from a run.
             */
            dryRun: boolean;
            /**
             * @description Everything the run could not do, in words, each naming the thing it is about
             *     by the name a person chose it by.
             *
             *     Warnings rather than errors, and the distinction is the feature's central
             *     bet: one leave type without a `defaultAllocatedDays` must not cost the other
             *     three their run, and one stale id in a list of two hundred must not cost the
             *     hundred and ninety-nine. Everything that *can* be done is done, and what
             *     could not is stated.
             *
             *     The list is capped by what can go wrong — a warning per leave type and per
             *     unknown id — not by the number of employees, so it cannot grow with the
             *     company.
             */
            warnings: string[];
        };
        GenerateLeaveBalancesDto: {
            /**
             * @description The year to open. The carry-over policy is applied to `year - 1`, which is
             *     therefore the year that gets closed by the same run.
             * @example 2026
             */
            year: number;
            employeeIds: string[][];
            leaveTypeIds: string[][];
            /**
             * @description Compute the whole run and write nothing.
             *
             *     Defaulted to `false` rather than `true`, which is the one place this DTO
             *     risks surprising somebody. A default of `true` would be safer for a
             *     mistyped request and worse for every correct one: a caller who meant to
             *     write would get a report indistinguishable from a successful run and would
             *     discover in March that no balance was ever created. An explicit flag makes
             *     the choice visible in the request, which is what a preview is for.
             *
             *     `@ValidateIfPresent()` rather than `@IsOptional()`, which also skips its
             *     constraints for `null` — and a `null` here would be read as "not a preview"
             *     and quietly write. There is no nullable spelling of this flag: it is absent,
             *     or it is a boolean.
             */
            dryRun?: boolean;
        };
        UpdateEmployeeLeaveBalanceDto: {
            /** @example 21 */
            allocatedDays?: number;
            /** @example 21 */
            carriedOverDays?: number;
            /**
             * @description Maintained by hand here, and by the Leave Requests feature later.
             *
             *     It stays editable rather than becoming read-only in anticipation: until
             *     requests exist, this is the only way to record days somebody has taken, and
             *     a correction to a miscounted figure has to be possible afterwards too.
             * @example 21
             */
            usedDays?: number;
            /**
             * @description Days written off by a year-end. Editable so a run that expired too much — a
             *     carry-over cap corrected after the fact — can be put right without deleting
             *     the balance and losing the year with it.
             *
             *     Re-running the generation will not undo an over-expiry for you. It is safe
             *     to run twice — expiring down to a cap leaves nothing above that cap, so the
             *     second run finds nothing to take — but that is idempotence, not a
             *     correction: it can only ever expire more, never give days back.
             * @example 21
             */
            expiredDays?: number;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            notes?: string | null;
        };
        LeaveRequestLeaveTypeSummary: {
            id: string;
            code: string;
            label: string;
            icon: string;
            color: string | null;
        };
        LeaveRequestEmployeeSummary: {
            id: string;
            employeeCode: string;
            firstName: string;
            lastName: string;
        };
        MyLeaveRequestEntity: {
            id: string;
            leaveType: components["schemas"]["LeaveRequestLeaveTypeSummary"];
            startDate: string;
            endDate: string;
            /** @description Derived, never stored. See `WorkingDaysService`. */
            requestedWorkingDays: number;
            /**
             * @description Whether the absence covers half a working day. Added by Feature 030.
             *
             *     **`requestedWorkingDays` is not halved by it**, and that is stated rather
             *     than an oversight: balances are counted in whole days, so a half day still
             *     consumes one. What the flag changes is the *timesheet* — the Timesheets
             *     module books half of that day's configured hours and leaves the rest fillable
             *     with work. Making the day count fractional is a decision with its own
             *     migration, recorded in the feature document rather than taken quietly here.
             */
            isHalfDay: boolean;
            /**
             * @description Which half, on a half-day absence; `null` on every whole-day one.
             * @enum {string|null}
             */
            halfDayPortion: "FIRST_HALF" | "SECOND_HALF" | null;
            reason: string | null;
            /** @enum {string} */
            status: "CANCELLED" | "PENDING" | "APPROVED" | "REJECTED";
            /** @description At least one, always — the API refuses a request without cover. */
            replacements: components["schemas"]["LeaveRequestEmployeeSummary"][];
            /**
             * @description Who decided, or `null`.
             *
             *     `null` on a request still `PENDING`, and also on one approved automatically
             *     because its leave type requires no approval — there `processedAt` is set and
             *     this is not, which is exactly how the two kinds of approval are told apart.
             */
            processedBy: components["schemas"]["LeaveRequestEmployeeSummary"] | null;
            processedAt: string | null;
            decisionReason: string | null;
            createdAt: string;
            updatedAt: string;
        };
        CreateLeaveRequestDto: {
            /** @example clv8k2x9b000008l3fh7g2n1q */
            leaveTypeId: string;
            /**
             * @description First day of the absence, inclusive.
             *
             *     An ISO-8601 string, kept as a string and parsed once in the service — see
             *     `@IsIsoDateString()` for why converting here would accept `01/13/2020`, a
             *     format whose meaning depends on which side of the Atlantic reads it.
             * @example 2026-09-01T00:00:00.000Z
             */
            startDate: string;
            /**
             * @description Last day of the absence, **inclusive**.
             *
             *     A one-day absence sends the same date twice rather than omitting this field.
             *     That is the convention the columns store and the one `PublicHoliday` already
             *     uses; making the end optional would give a one-day request two spellings and
             *     force every reader to handle both.
             *
             *     That it must not precede `startDate`, and that the span has a maximum
             *     length, are rules about two fields at once — checked in the service, beside
             *     the other statements about what a valid request is.
             * @example 2026-09-01T00:00:00.000Z
             */
            endDate: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            reason?: string | null;
            replacementEmployeeIds: string[][];
            /**
             * @description Whether the absence covers half a working day rather than whole ones.
             *
             *     Added by Feature 030. Omitted, the schema's `false` applies — every request
             *     written before this field existed is what it always was, a whole-day
             *     absence — so `null` is not the same request and is rejected: the column is
             *     not nullable and has nothing to store.
             *
             *     **Orthogonal to `leaveTypeId`, deliberately.** Half a day is a quantity, not
             *     a kind of leave: any type may be taken for half a day, and spelling it as an
             *     `ANNUAL_HALF_DAY` type would have doubled every type HR maintains and every
             *     balance hanging off one.
             *
             *     **How many hours half a day is, is not stated here**, and cannot be: it is
             *     half of that day's configured hours in the work schedule, so a company on a
             *     seven-hour day gets three and a half rather than a hard-coded four. The
             *     Timesheets module reads it; nothing in this feature computes hours at all.
             */
            isHalfDay?: boolean;
            /**
             * @description Which half, on a half-day absence.
             *
             *     **Required when `isHalfDay` is true and refused otherwise.** That is a rule
             *     about two fields at once, so it is checked in the service beside the other
             *     statements about what a valid request is, rather than here — the same call
             *     `decisionReason` makes against the resolved status.
             *
             *     It matters because it decides which hours are left for work: somebody away
             *     for the morning fills the afternoon, and a timesheet that could not say which
             *     half would be describing a different day.
             * @enum {string|null}
             */
            halfDayPortion?: "FIRST_HALF" | "SECOND_HALF" | null;
        };
        UpdateLeaveRequestDto: {
            /** @example clv8k2x9b000008l3fh7g2n1q */
            leaveTypeId?: string;
            /**
             * @description Moving either end re-opens every rule.
             *
             *     The service judges the span the patch would *leave behind*, not the fields
             *     the body happens to carry: `PATCH { endDate }` is checked against the stored
             *     `startDate`, the working days are recounted, and the balance is re-tested
             *     against the new total. That is why the merge happens there rather than here,
             *     the same shape `PublicHolidayService.update` uses.
             * @example 2026-09-01T00:00:00.000Z
             */
            startDate?: string;
            /** @example 2026-09-01T00:00:00.000Z */
            endDate?: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            reason?: string | null;
            replacementEmployeeIds: string[][];
            /**
             * @description Turning a whole-day absence into a half day, or back.
             *
             *     The two half-day fields are merged with the stored ones and judged together,
             *     like the span: sending `{ "isHalfDay": false }` on a request that carries a
             *     portion is the failing case, and neither field alone is wrong. The service
             *     therefore checks the pair a patch would *leave behind*, and clears the
             *     portion when the request stops being a half day rather than leaving a value
             *     behind that contradicts the flag.
             */
            isHalfDay?: boolean;
            /**
             * @description Nullable: `null` says the absence is no longer confined to one half.
             * @enum {string|null}
             */
            halfDayPortion?: "FIRST_HALF" | "SECOND_HALF" | null;
        };
        LeaveRequestDepartmentSummary: {
            id: string;
            code: string;
            name: string;
        };
        LeaveRequestRequesterSummary: {
            id: string;
            employeeCode: string;
            firstName: string;
            lastName: string;
            department: components["schemas"]["LeaveRequestDepartmentSummary"];
        };
        LeaveRequestEntity: {
            id: string;
            leaveType: components["schemas"]["LeaveRequestLeaveTypeSummary"];
            startDate: string;
            endDate: string;
            /** @description Derived, never stored. See `WorkingDaysService`. */
            requestedWorkingDays: number;
            /**
             * @description Whether the absence covers half a working day. Added by Feature 030.
             *
             *     **`requestedWorkingDays` is not halved by it**, and that is stated rather
             *     than an oversight: balances are counted in whole days, so a half day still
             *     consumes one. What the flag changes is the *timesheet* — the Timesheets
             *     module books half of that day's configured hours and leaves the rest fillable
             *     with work. Making the day count fractional is a decision with its own
             *     migration, recorded in the feature document rather than taken quietly here.
             */
            isHalfDay: boolean;
            /**
             * @description Which half, on a half-day absence; `null` on every whole-day one.
             * @enum {string|null}
             */
            halfDayPortion: "FIRST_HALF" | "SECOND_HALF" | null;
            reason: string | null;
            /** @enum {string} */
            status: "CANCELLED" | "PENDING" | "APPROVED" | "REJECTED";
            /** @description At least one, always — the API refuses a request without cover. */
            replacements: components["schemas"]["LeaveRequestEmployeeSummary"][];
            /**
             * @description Who decided, or `null`.
             *
             *     `null` on a request still `PENDING`, and also on one approved automatically
             *     because its leave type requires no approval — there `processedAt` is set and
             *     this is not, which is exactly how the two kinds of approval are told apart.
             */
            processedBy: components["schemas"]["LeaveRequestEmployeeSummary"] | null;
            processedAt: string | null;
            decisionReason: string | null;
            createdAt: string;
            updatedAt: string;
            employee: components["schemas"]["LeaveRequestRequesterSummary"];
        };
        UpdateLeaveRequestStatusDto: {
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            decisionReason?: string | null;
            /**
             * @description The decision: `APPROVED`, `REJECTED` or `CANCELLED`.
             *
             *     `@IsIn` over the closed list rather than `@IsEnum(LeaveRequestStatus)`,
             *     because the enum has a fourth member this endpoint must refuse. `@IsEnum`
             *     would have accepted `PENDING` and left the rejection to the service, which
             *     is a rule about the *shape of the body* enforced one layer too late.
             * @enum {string}
             */
            status: "APPROVED" | "REJECTED" | "CANCELLED";
        };
        NotificationEntity: {
            id: string;
            /** @enum {string} */
            workspace: "PERSONAL" | "ADMINISTRATIVE";
            /** @enum {string} */
            recipientType: "USER" | "ROLE" | "ALL_USERS" | "ADMINISTRATIVE_USERS";
            /** @description Set only for `USER` notifications; null for role notifications and broadcasts. */
            recipientUserId: string | null;
            /**
             * @description Set only for `ROLE` notifications; one of the three administrative roles.
             * @enum {string|null}
             */
            recipientRole: "SUPERADMIN" | "ADMIN" | "HR" | "USER" | null;
            title: string;
            message: string;
            /** @enum {string} */
            category: "TIMESHEET" | "GENERAL" | "SYSTEM" | "LEAVE" | "REMINDER" | "MAINTENANCE";
            /** @enum {string} */
            type: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
            /** @enum {string} */
            priority: "MEDIUM" | "LOW" | "HIGH";
            isRead: boolean;
            /** @description When it was read, or null while it is unread. Moves with `isRead`, never alone. */
            readAt: string | null;
            createdAt: string;
            updatedAt: string;
        };
        NotificationBulkResult: {
            /**
             * @description The number of rows the operation changed or deleted.
             *
             *     `0` is a legitimate and common answer: an inbox with nothing unread
             *     answers `0` to "mark all read", and that is a successful request rather
             *     than a failed one.
             */
            affected: number;
        };
        CreateNotificationDto: {
            /**
             * @description The one account addressed.
             *
             *     Optional *here* and conditionally required by the service: mandatory when
             *     `recipientType` is `USER`, refused otherwise. Marked `@IsOptional()` rather
             *     than `@ValidateIfPresent()` because omitting it is the normal case for three
             *     of the four recipient types.
             *
             *     A `users.id`, not an `employees.id`. An account is what a person signs in
             *     with, and not every account has an employment record — a super-admin created
             *     to administer the system is the obvious case.
             * @example clv8k2x9b000008l3fh7g2n1q
             */
            recipientUserId?: string;
            /**
             * @description Which inbox the notification is filed in.
             *
             *     Required and not defaulted. A notification is written for employees or for
             *     the back office, and guessing which would put administrative messages in
             *     everybody's personal list — the one mistake this field exists to prevent.
             * @enum {string}
             */
            workspace: "PERSONAL" | "ADMINISTRATIVE";
            /**
             * @description How the notification names its audience. Required, for the same reason.
             * @enum {string}
             */
            recipientType: "USER" | "ROLE" | "ALL_USERS" | "ADMINISTRATIVE_USERS";
            /**
             * @description The one administrative role addressed.
             *
             *     `@IsIn(ADMINISTRATIVE_ROLES)` rather than `@IsEnum(UserRole)`, which is the
             *     whole reason the column's wider type is safe: `USER` is a `UserRole` and is
             *     not a role a notification may be addressed to — an `ADMINISTRATIVE` message
             *     aimed at every ordinary employee is a contradiction, and `ALL_USERS` in the
             *     personal workspace is how you actually reach them.
             * @enum {string}
             */
            recipientRole?: "SUPERADMIN" | "ADMIN" | "HR";
            /** @description The heading. Trimmed first, so `"   "` is rejected as empty rather than stored. */
            title: string;
            /** @description The body, plain text. */
            message: string;
            /**
             * @description What the notification is about, how it looks, and how loudly it asks.
             *
             *     All three carry their default as a property initialiser — the technique
             *     every DTO in this project uses — so an absent field leaves the initialiser
             *     in place and the service never applies a fallback of its own. The defaults
             *     describe an ordinary informational notice of normal importance, which is
             *     what a caller who said nothing meant.
             *
             *     `category` and `type` are separate fields answering separate questions:
             *     where it came from, and how urgent it looks. A rejected leave request is
             *     `LEAVE` + `ERROR`; a finished import is `SYSTEM` + `SUCCESS`. Folding them
             *     into one field would make "every leave notification" unanswerable.
             * @default GENERAL
             * @enum {string}
             */
            category: "TIMESHEET" | "GENERAL" | "SYSTEM" | "LEAVE" | "REMINDER" | "MAINTENANCE";
            /**
             * @default INFO
             * @enum {string}
             */
            type: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
            /**
             * @default MEDIUM
             * @enum {string}
             */
            priority: "MEDIUM" | "LOW" | "HIGH";
        };
        ReminderEntity: {
            id: string;
            name: string;
            description: string | null;
            enabled: boolean;
            /** @description Days before the deadline. `0` is the deadline itself. */
            daysBeforeDeadline: number;
            subject: string;
            message: string;
            /** @enum {string} */
            severity: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
            /** @enum {string} */
            priority: "MEDIUM" | "LOW" | "HIGH";
            sendEmail: boolean;
            sendNotification: boolean;
            createdAt: string;
            updatedAt: string;
        };
        CreateReminderDto: {
            /**
             * @description What the rule is called. Unique across reminders, case-insensitively — the
             *     service checks it and reports a `409`.
             * @example Monthly timesheet reminder
             */
            name: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            /**
             * @description The heading the engine will copy into whatever it produces.
             * @example Planned maintenance on Saturday
             */
            subject: string;
            /** @description The body, plain text. */
            message: string;
            /**
             * @description Whether the engine should act on this rule.
             *
             *     Defaulted to `true` as a property initialiser — the technique every DTO in
             *     this project uses — because a reminder somebody has just configured is one
             *     they want. Creating a disabled reminder stays possible by saying so.
             * @default true
             */
            enabled: boolean;
            /**
             * @description How many days before the deadline the reminder goes out.
             *
             *     `0` is the deadline itself and is a deliberate value rather than a
             *     degenerate one — "your timesheet is due today" is the reminder people act
             *     on. Negatives are refused: a reminder after the thing it warns about is a
             *     data-entry mistake, not a late reminder.
             *
             *     `@Type(() => Number)` is not applied. This arrives in a JSON body, where a
             *     number has a representation of its own, so `7` and `"7"` are genuinely
             *     different values and the string is a payload the client should fix — the
             *     opposite call the query DTOs make, where everything is text by construction.
             */
            daysBeforeDeadline: number;
            /**
             * @description How the reminder is drawn and how loudly it asks.
             *
             *     `severity` is a `NotificationType` — the enum the notification centre stores
             *     in `notifications.type` — rather than a second enum of the same four values,
             *     so the delivery engine copies the value across instead of translating
             *     between two vocabularies. Both carry the same defaults the centre uses.
             * @default INFO
             * @enum {string}
             */
            severity: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
            /**
             * @default MEDIUM
             * @enum {string}
             */
            priority: "MEDIUM" | "LOW" | "HIGH";
            /**
             * @description How the reminder reaches people. At least one must be true, which the
             *     service enforces.
             *
             *     The defaults are asymmetric on purpose: an in-app notification is cheap and
             *     expected, while email leaves the system and lands in an inbox somebody has
             *     to clear, so it is the one that has to be asked for.
             * @default false
             */
            sendEmail: boolean;
            /** @default true */
            sendNotification: boolean;
        };
        UpdateReminderDto: {
            /** @example Monthly timesheet reminder */
            name?: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            /** @example Planned maintenance on Saturday */
            subject?: string;
            message?: string;
            enabled?: boolean;
            daysBeforeDeadline?: number;
            /** @enum {string} */
            severity?: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
            /** @enum {string} */
            priority?: "MEDIUM" | "LOW" | "HIGH";
            /**
             * @description The two delivery switches, judged **against the stored pair**.
             *
             *     Sending `{ "sendEmail": false }` on a reminder that already has
             *     `sendNotification: false` is the failing case, and neither field is wrong on
             *     its own — which is exactly why the rule cannot live on this class. The
             *     service merges the patch into the stored row and refuses the result.
             */
            sendEmail?: boolean;
            sendNotification?: boolean;
        };
        CampaignEmployeeSummary: {
            id: string;
            employeeCode: string;
            firstName: string;
            lastName: string;
        };
        NotificationCampaignSummaryEntity: {
            id: string;
            subject: string;
            message: string;
            /** @enum {string} */
            severity: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
            /** @enum {string} */
            priority: "MEDIUM" | "LOW" | "HIGH";
            sendEmail: boolean;
            sendNotification: boolean;
            /** @enum {string} */
            status: "CANCELLED" | "DRAFT" | "SCHEDULED" | "SENT";
            /** @description When the engine should send it, or null on a draft. */
            scheduledAt: string | null;
            /** @description When it stops being worth showing, or null. */
            expiresAt: string | null;
            /** @description When the engine sent it. **Always null in this feature** — nothing sends. */
            sentAt: string | null;
            createdBy: components["schemas"]["CampaignEmployeeSummary"];
            /**
             * @description How the audience was named: one person, several, or everybody.
             * @enum {string}
             */
            recipientType: "EMPLOYEE" | "ALL_EMPLOYEES";
            /**
             * @description How many `notification_recipients` rows the campaign holds.
             *
             *     **`1` for `ALL_EMPLOYEES`**, which is the stored row count rather than the
             *     size of the audience — the audience is resolved when the campaign is sent,
             *     and nothing here knows how many people will be employed by then. A client
             *     shows a number for `EMPLOYEE` and the words "All employees" for the other.
             */
            recipientCount: number;
            createdAt: string;
            updatedAt: string;
        };
        NotificationRecipientEntity: {
            id: string;
            /** @enum {string} */
            recipientType: "EMPLOYEE" | "ALL_EMPLOYEES";
            /** @description The person addressed, or null on the `ALL_EMPLOYEES` entry. */
            employee: components["schemas"]["CampaignEmployeeSummary"] | null;
        };
        NotificationCampaignEntity: {
            id: string;
            subject: string;
            message: string;
            /** @enum {string} */
            severity: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
            /** @enum {string} */
            priority: "MEDIUM" | "LOW" | "HIGH";
            sendEmail: boolean;
            sendNotification: boolean;
            /** @enum {string} */
            status: "CANCELLED" | "DRAFT" | "SCHEDULED" | "SENT";
            /** @description When the engine should send it, or null on a draft. */
            scheduledAt: string | null;
            /** @description When it stops being worth showing, or null. */
            expiresAt: string | null;
            /** @description When the engine sent it. **Always null in this feature** — nothing sends. */
            sentAt: string | null;
            createdBy: components["schemas"]["CampaignEmployeeSummary"];
            /**
             * @description How the audience was named: one person, several, or everybody.
             * @enum {string}
             */
            recipientType: "EMPLOYEE" | "ALL_EMPLOYEES";
            /**
             * @description How many `notification_recipients` rows the campaign holds.
             *
             *     **`1` for `ALL_EMPLOYEES`**, which is the stored row count rather than the
             *     size of the audience — the audience is resolved when the campaign is sent,
             *     and nothing here knows how many people will be employed by then. A client
             *     shows a number for `EMPLOYEE` and the words "All employees" for the other.
             */
            recipientCount: number;
            createdAt: string;
            updatedAt: string;
            /** @description At least one entry, always — the API refuses a campaign addressed to nobody. */
            recipients: components["schemas"]["NotificationRecipientEntity"][];
        };
        CreateNotificationCampaignDto: {
            /**
             * @description The heading.
             * @example Planned maintenance on Saturday
             */
            subject: string;
            /** @description The body, plain text. */
            message: string;
            /**
             * @description When the engine should send it. Absent means a draft nobody has scheduled.
             *
             *     Must be in the future, which the service checks against the server's clock
             *     rather than the client's: a campaign scheduled for a moment that has already
             *     passed is either a mistake or a request to send immediately, and the two are
             *     worth telling apart before an announcement goes to the whole company.
             *
             *     An ISO-8601 string, kept as a string and parsed once in the service — see
             *     `@IsIsoDateString()` for why converting here would accept `01/13/2020`, a
             *     format whose meaning depends on which side of the Atlantic reads it.
             * @example 2026-09-01T00:00:00.000Z
             */
            scheduledAt?: string;
            /**
             * @description When the announcement stops being worth showing. Absent means it never goes
             *     stale.
             *
             *     Must be later than `scheduledAt` when both are given — an expiry at or
             *     before the send is a campaign that is over before it begins — and later than
             *     now when it is the only one of the two, since a draft that has already
             *     expired can never be sent usefully. Both comparisons are the service's.
             * @example 2026-09-01T00:00:00.000Z
             */
            expiresAt?: string;
            employeeIds: string[][];
            /**
             * @description How the announcement is drawn and how loudly it asks.
             *
             *     `severity` is a `NotificationType` — the enum the notification centre stores
             *     in `notifications.type` — so the delivery engine copies the value across
             *     rather than translating between two vocabularies of the same four words.
             * @default INFO
             * @enum {string}
             */
            severity: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
            /**
             * @default MEDIUM
             * @enum {string}
             */
            priority: "MEDIUM" | "LOW" | "HIGH";
            /**
             * @description How it reaches people. At least one must be true, which the service
             *     enforces; the defaults are the same asymmetric pair a reminder carries.
             * @default false
             */
            sendEmail: boolean;
            /** @default true */
            sendNotification: boolean;
            /**
             * @description How the campaign names its audience.
             *
             *     Required and not defaulted. "One employee" and "everybody" are different
             *     announcements, and guessing between them would either spam the company or
             *     quietly deliver a company-wide notice to one person.
             * @enum {string}
             */
            recipientType: "EMPLOYEE" | "ALL_EMPLOYEES";
        };
        UpdateNotificationCampaignDto: {
            /** @example Planned maintenance on Saturday */
            subject?: string;
            message?: string;
            /**
             * @description Nullable: `null` unschedules the campaign and returns it to `DRAFT`.
             * @example 2026-09-01T00:00:00.000Z
             */
            scheduledAt?: string | null;
            /**
             * @description Nullable: `null` removes the expiry.
             * @example 2026-09-01T00:00:00.000Z
             */
            expiresAt?: string | null;
            employeeIds: string[][];
            /** @enum {string} */
            severity?: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
            /** @enum {string} */
            priority?: "MEDIUM" | "LOW" | "HIGH";
            /**
             * @description The two delivery switches, judged **against the stored pair**: sending
             *     `{ "sendEmail": false }` on a campaign that already has
             *     `sendNotification: false` is the failing case, and neither field is wrong on
             *     its own.
             */
            sendEmail?: boolean;
            sendNotification?: boolean;
            /**
             * @description The one status a client may write, and the only value this field accepts.
             *
             *     `@IsIn(CLIENT_WRITABLE_CAMPAIGN_STATUSES)` rather than
             *     `@IsEnum(NotificationCampaignStatus)`, which is what keeps the derivation
             *     above honest: `DRAFT` and `SCHEDULED` are decided by `scheduledAt`, so
             *     accepting them here would be a second way to state one fact, and `SENT` is
             *     the delivery engine's record that it ran — a client that could write it
             *     would be claiming an announcement had gone out when nothing had.
             *
             *     Cancelling is terminal. A cancelled campaign can no longer be patched, so
             *     there is no way back through this field; composing the announcement again is
             *     a new campaign, which is the honest record of what happened.
             * @enum {string}
             */
            status?: "CANCELLED";
            /**
             * @description The audience, replaced **wholesale** when it is sent.
             *
             *     Sending `recipientType` replaces every recipient the campaign had; omitting
             *     it leaves them untouched. There is no "add one" or "remove one" endpoint,
             *     and that is deliberate: the rule is "either one `ALL_EMPLOYEES` entry or a
             *     set of named employees, never both", which is a statement about the set.
             *     Judged one nomination at a time, removing the last one would have to be
             *     refused by a rule that read as if it were about that person rather than
             *     about the campaign — the same argument `UpdateLeaveRequestDto` makes for its
             *     replacements.
             *
             *     `employeeIds` on its own is a `400`: without a recipient type there is no
             *     way to tell a corrected list of names from a switch to `ALL_EMPLOYEES` that
             *     forgot to drop them.
             * @enum {string}
             */
            recipientType?: "EMPLOYEE" | "ALL_EMPLOYEES";
        };
        DeliveryResultEntity: {
            /** @enum {string} */
            source: "CAMPAIGN" | "REMINDER" | "EVENT";
            /** @description The campaign that was sent, or null for a reminder or an event run. */
            campaignId: string | null;
            /** @description The reminder rule that fired, or null for a campaign or an event. */
            reminderId: string | null;
            /**
             * @description Which application event was announced — `timesheet_rejected` — or null for a
             *     campaign or a reminder.
             *
             *     A key rather than an id, because an event has no stored row to point at: it
             *     is something that *happened* in another module, announced as it happened. The
             *     key is what a log line and a template are both named by. Added by Feature 030.
             */
            eventKey: string | null;
            /**
             * @description How many people the audience resolved to at this moment.
             *
             *     `0` on a delivery addressed to a *workspace* rather than to people — an
             *     administrative broadcast is one notification row that every administrator
             *     reads, so there is no list of recipients to count. `notificationsCreated`
             *     says `1` there, which together are the honest description.
             */
            recipientCount: number;
            notificationsCreated: number;
            emailsSent: number;
            /** @enum {string} */
            emailStatus: "SENT" | "SKIPPED" | "FAILED";
            /** @description When the run happened, ISO-8601. For a campaign this is its `sentAt`. */
            sentAt: string;
        };
        TimesheetDepartmentSummary: {
            id: string;
            code: string;
            name: string;
        };
        TimesheetPositionSummary: {
            id: string;
            code: string;
            name: string;
        };
        TimesheetOwnerSummary: {
            department: components["schemas"]["TimesheetDepartmentSummary"];
            position: components["schemas"]["TimesheetPositionSummary"];
            id: string;
            employeeCode: string;
            firstName: string;
            lastName: string;
        };
        TimesheetEmployeeSummary: {
            id: string;
            employeeCode: string;
            firstName: string;
            lastName: string;
        };
        TimesheetProjectSummary: {
            id: string;
            code: string;
            name: string;
            clientName: string;
        };
        TimesheetEntryEntity: {
            id: string;
            /** @description The calendar day, ISO-8601 at UTC midnight. */
            date: string;
            /** @enum {string} */
            type: "LEAVE" | "WORK" | "HOLIDAY";
            hours: number;
            /** @description The project, or `null` on a `LEAVE` or `HOLIDAY` line — nobody was working. */
            project: components["schemas"]["TimesheetProjectSummary"] | null;
            /**
             * @description The approved absence a `LEAVE` line is justified by; `null` on the other two.
             *
             *     An id rather than the request itself, because a timesheet screen does not
             *     render a leave request — it renders that the day was leave. The id is what a
             *     client follows to `GET /api/v1/me/leave-requests/:id` if somebody clicks.
             */
            leaveRequestId: string | null;
            description: string | null;
            /**
             * @description Whether this line is the fill-in engine's rather than the employee's.
             *
             *     **Derived from `type`, and published anyway.** `LEAVE` and `HOLIDAY` lines
             *     are produced from the approved leave requests and the public holidays, and
             *     their type and hours are refused on the way in — see `TimesheetFillService`.
             *     A client has to draw them differently: greyed, without a delete button, with
             *     the project picker hidden.
             *
             *     It is a field rather than a rule the frontend re-derives because the rule is
             *     this module's and will change here first — the day a fourth entry type
             *     exists, a client that had hard-coded "leave and holiday are locked" would
             *     silently offer an editable row the API then refuses.
             */
            isLocked: boolean;
            createdAt: string;
            updatedAt: string;
        };
        TimesheetEntity: {
            id: string;
            employee: components["schemas"]["TimesheetOwnerSummary"];
            /** @description `1`–`12`. January is `1`, not `0`. */
            month: number;
            year: number;
            /** @enum {string} */
            status: "APPROVED" | "REJECTED" | "DRAFT" | "SUBMITTED";
            submittedAt: string | null;
            reviewedAt: string | null;
            /** @description Who approved or refused it, or `null` while nobody has. */
            reviewedBy: components["schemas"]["TimesheetEmployeeSummary"] | null;
            /**
             * @description Why it was refused. Not cleared when the owner resubmits — the reason is what
             *     they were asked to fix, and blanking it the moment they act on it would leave
             *     the history of the month unable to say why it took two attempts.
             */
            rejectionReason: string | null;
            /** @description Something it was filled against has changed. Advisory; nothing was rewritten. */
            isStale: boolean;
            /**
             * @description The working-day and hours context this month was approved against.
             *
             *     Non-null only on an `APPROVED` timesheet. It is a *photograph* — nothing
             *     queries inside it and no client is expected to — published so an approval can
             *     be explained years later, when the live schedule no longer resembles the one
             *     it was signed off under.
             */
            scheduleSnapshot: Record<string, never> | null;
            /** @description Every line, in day order then insertion order. */
            entries: components["schemas"]["TimesheetEntryEntity"][];
            createdAt: string;
            updatedAt: string;
            /** @description `WORK` lines — the hours booked to projects. */
            workedHours: number;
            /** @description `LEAVE` lines — approved absence, at the configured rate for the day. */
            leaveHours: number;
            /** @description `HOLIDAY` lines — days the company was closed. */
            holidayHours: number;
            /** @description All three together. */
            totalHours: number;
        };
        CreateTimesheetDto: {
            /**
             * @description `1`–`12`. January is `1`, matching the URL parameters and the column.
             * @example 9
             */
            month: number;
            /** @example 2026 */
            year: number;
        };
        TimesheetEntryInputDto: {
            /**
             * @description The calendar day.
             *
             *     An ISO-8601 string, kept as a string and parsed once in the service — see
             *     `@IsIsoDateString()` for why converting here would accept `01/13/2020`, a
             *     format whose meaning depends on which side of the Atlantic reads it.
             *
             *     That it must fall inside the timesheet's own month, inside the employment
             *     window, and on a day the company actually works are three rules that need the
             *     header, the employee and the work schedule — so they belong to
             *     `TimesheetFillService`.
             * @example 2026-09-01T00:00:00.000Z
             */
            date: string;
            /**
             * @description How long, in hours. Greater than zero, at most two decimals.
             *
             *     The *real* limits — the smallest and largest single entry, the daily ceiling,
             *     the weekly one — are configured in the work schedule and applied by the
             *     service. Nothing here knows how long a working day is.
             * @example 8
             */
            hours: number;
            /**
             * @description The project the work was booked to.
             *
             *     **Required for `WORK` and refused for the other two.** That is a rule about
             *     two fields at once, so the service enforces it: `LEAVE` and `HOLIDAY` name no
             *     project because nobody was working, and attributing an absence to a project
             *     would put hours in that project's total that were never worked on it.
             *
             *     Whether the project exists is a question for the database, and the service
             *     asks it — every referenced id in one query rather than one per line.
             * @example clv8k2x9b000008l3fh7g2n1q
             */
            projectId?: string;
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            description?: string | null;
            /**
             * @description What the hours account for.
             *
             *     `LEAVE` and `HOLIDAY` are accepted here and then checked hard: they must
             *     match a day the fill-in engine has already decided is leave or a holiday, at
             *     exactly the hours it computed. A client may therefore echo back the whole
             *     month it was shown — which is what a form does — without being able to invent
             *     an absence nobody approved.
             *
             *     Refusing the two types outright would have been simpler and worse: a client
             *     would have to strip them before every save, and one that forgot would silently
             *     delete somebody's leave from their month.
             * @enum {string}
             */
            type: "LEAVE" | "WORK" | "HOLIDAY";
        };
        SetTimesheetEntriesDto: {
            /**
             * @description Every line the month should have.
             *
             *     `@Type()` is required for the nested validation to run at all — without it
             *     `class-transformer` hands `class-validator` plain objects and
             *     `@ValidateNested({ each: true })` silently passes everything. It works
             *     globally thanks to the `transform: true` option on the application's
             *     `ValidationPipe`.
             *
             *     The cap bounds the work one write can ask for; see
             *     {@link TIMESHEET_MAX_ENTRIES}. There is no minimum — an empty month is a
             *     legitimate thing to save.
             */
            entries: components["schemas"]["TimesheetEntryInputDto"][];
        };
        TimesheetListRowEntity: {
            /** @description `WORK` lines — the hours booked to projects. */
            workedHours: number;
            /** @description `LEAVE` lines — approved absence, at the configured rate for the day. */
            leaveHours: number;
            /** @description `HOLIDAY` lines — days the company was closed. */
            holidayHours: number;
            /** @description All three together. */
            totalHours: number;
            id: string;
            employee: components["schemas"]["TimesheetOwnerSummary"];
            /** @description `1`–`12`. January is `1`, not `0`. */
            month: number;
            year: number;
            /** @enum {string} */
            status: "APPROVED" | "REJECTED" | "DRAFT" | "SUBMITTED";
            submittedAt: string | null;
            reviewedAt: string | null;
            /** @description Who approved or refused it, or `null` while nobody has. */
            reviewedBy: components["schemas"]["TimesheetEmployeeSummary"] | null;
            /**
             * @description Why it was refused. Not cleared when the owner resubmits — the reason is what
             *     they were asked to fix, and blanking it the moment they act on it would leave
             *     the history of the month unable to say why it took two attempts.
             */
            rejectionReason: string | null;
            /** @description Something it was filled against has changed. Advisory; nothing was rewritten. */
            isStale: boolean;
            createdAt: string;
            updatedAt: string;
        };
        RejectTimesheetDto: {
            /** @description Trimmed; a blank string is stored as `null` rather than as "". */
            rejectionReason: string;
        };
        ReportDefinitionEntity: {
            /**
             * @description The key that goes in the URL — `attendance-sheet`.
             * @enum {string}
             */
            key: "project-hours-per-employee" | "timesheet-status" | "attendance-sheet" | "leave-calendar" | "employee-hours-per-project";
            /** @description The English name, for a menu. */
            name: string;
            /**
             * @description The Romanian name, which is what the people who asked for these reports
             *     actually call them and what the printed document carries.
             */
            romanianName: string;
            /**
             * @description What the report shows **and which timesheet states it counts**.
             *
             *     The second half is the part that matters: it is the one thing a person
             *     choosing between two reports cannot infer from the title, and the one thing
             *     that makes two of these show different totals for the same month.
             */
            description: string;
        };
        ReportKpi: {
            key: string;
            label: string;
            value: number;
            /** @description `hours`, `employees` — what the number counts, printed under it. */
            unit: string;
        };
        ReportColumn: {
            key: string;
            label: string;
            /**
             * @description The second line of a column header — an employee's code, or their
             *     department.
             *
             *     The two hour matrices differ in exactly this: the project report labels its
             *     employee columns with the department, the employee report with the employee
             *     code. Same data, same builder input, two presentations.
             */
            sublabel: string | null;
            /** @enum {string} */
            type: "number" | "text" | "marker";
            /** @description The right-hand total column, which renderers emphasise. */
            isTotal: boolean;
        };
        ReportTextCell: {
            kind: string;
            text: string | null;
        };
        ReportNumberCell: {
            kind: string;
            /**
             * @description The number itself, or `null` for a cell with no value.
             *
             *     `null` rather than `0`, and the distinction is load-bearing on the two hour
             *     matrices: a project an employee did not touch is blank, and writing `0`
             *     would turn a grid that is mostly empty into a wall of zeros while claiming
             *     somebody booked no hours to something they were never on.
             */
            value: number | null;
            /** @description `140h`, `—`. What the PDF prints. */
            text: string;
        };
        ReportMarkerCell: {
            kind: string;
            /** @description `C`, `S`, `L` — one to three characters. */
            marker: string;
            /** @description What the PDF prints, which may be richer than the marker. */
            text: string;
            /** @description Ties the cell to its {@link ReportLegendItem}. */
            legendKey: string;
        };
        ReportRow: {
            /**
             * @description The row's cells, keyed by {@link ReportColumn.key}.
             *
             *     Documented as a free-form map whose values are one of the three cell
             *     shapes. The keys are a *property* of the report — they are whatever
             *     `columns` declared, which differs per report and per month — so there is
             *     no fixed set of them to publish, and `additionalProperties` is the honest
             *     description rather than a limitation of the tooling.
             */
            cells: {
                [key: string]: components["schemas"]["ReportTextCell"] | components["schemas"]["ReportNumberCell"] | components["schemas"]["ReportMarkerCell"];
            };
            key: string;
            /** @enum {string} */
            kind: "data" | "total" | "group";
            /** @description What a `group` or `total` row prints across its width. */
            label: string;
            /**
             * @description A short badge before the label on a group band — `TEC` for `TechCorp
             *     Solutions`.
             *
             *     Derived from the client's name rather than looked up, because **this
             *     application has no client entity**: a project names its customer in
             *     `Project.clientName`, a free string. The badge is presentation and nothing
             *     keys off it.
             */
            badge: string | null;
        };
        ReportLegendItem: {
            key: string;
            marker: string;
            label: string;
        };
        ReportPeriod: {
            month: number;
            year: number;
            /** @description `September 2026` — what a heading and a legend print. */
            label: string;
            /** @description `2026-09` — what a filename carries. */
            key: string;
            /**
             * @description The company's IANA zone, from the Work Schedule singleton.
             *
             *     Reported so a reader knows which clock the instant-valued columns were
             *     rendered against — see `toZonedDateKey`. It does **not** shift the calendar
             *     dates: a timesheet entry's `date` is a calendar day, not a moment, and
             *     re-interpreting it through a zone would move it a column.
             */
            timezone: string;
        };
        ReportDataModel: {
            /**
             * @description The header strip above the grid.
             *
             *     The five properties on this class that hold a `readonly T[]` each carry an
             *     explicit `@ApiProperty` (Feature 038), and they are the only ones in the
             *     project that do. The schema generator's plugin infers `T[]` from the type
             *     on its own but not `readonly T[]` — it emits no type at all — and a
             *     property with no type is reported, misleadingly, as a circular dependency
             *     when the document is built. Naming the type here is what keeps the arrays
             *     `readonly`: the alternative was to weaken the declarations to plain arrays
             *     to suit the generator, which would trade a real compile-time guarantee for
             *     a documentation tool's convenience.
             */
            kpis: components["schemas"]["ReportKpi"][];
            /** @description One entry per column of the grid, in the order they are printed. */
            columns: components["schemas"]["ReportColumn"][];
            /**
             * @description Every row in final order — data rows, client group bands and total rows
             *     together.
             *
             *     One ordered list rather than `rows` plus `groups` plus `totalRows`, because
             *     the order is the report: a group band belongs immediately above the projects
             *     it introduces, and a total row belongs last. Split across three properties, a
             *     renderer would have to re-interleave them, and the three renderers would
             *     eventually interleave them differently.
             */
            rows: components["schemas"]["ReportRow"][];
            /**
             * @description What the markers in the grid mean.
             *
             *     **Built per report from the days that actually occur in the period**, never
             *     from the full list of configured leave types. A legend listing eight kinds of
             *     leave for a month in which two were taken is a legend nobody reads; and one
             *     hard-coded in this module would go stale the day a company adds a leave type.
             *
             *     Empty on the reports that use no markers, which is how a renderer knows not
             *     to draw a legend box at all.
             */
            legend: components["schemas"]["ReportLegendItem"][];
            /** @enum {string} */
            reportType: "project-hours-per-employee" | "timesheet-status" | "attendance-sheet" | "leave-calendar" | "employee-hours-per-project";
            /** @description `Collective attendance sheet` — the heading in English. */
            title: string;
            /**
             * @description `Foaie colectivă de prezență` — the name the people who asked for these
             *     reports actually use.
             *
             *     Carried beside the English title rather than instead of it, because the
             *     printed documents are Romanian while every other string this API produces is
             *     English. Both are in the model so the renderers do not have to choose.
             */
            romanianTitle: string;
            /** @description One line under the heading: what the grid shows, and for how many people. */
            subtitle: string;
            period: components["schemas"]["ReportPeriod"];
            /** @description When this was generated, ISO-8601 UTC. Rendered in the company's zone. */
            generatedAt: string;
            /**
             * @description How a PDF page is turned.
             *
             *     On the model rather than in the PDF renderer because it is a property of the
             *     *report* — the four grid reports are wide and the status summary is not — and
             *     a renderer holding a list of which types are landscape would be a second
             *     place that has to learn about a sixth report.
             * @enum {string}
             */
            orientation: "portrait" | "landscape";
            /**
             * @description Which timesheet states this report counted, in a sentence.
             *
             *     Printed on every export and returned in every preview, because it is the one
             *     thing that makes two of these reports show different totals for the same
             *     month and the one thing a reader cannot infer from the grid. An attendance
             *     sheet counting only approved months and a leave calendar ignoring timesheets
             *     entirely are both correct and are not comparable, and the document should say
             *     so on its face rather than in a wiki.
             */
            sourceNote: string;
        };
        ReportQueryDto: {
            /**
             * @description The month, `1`–`12`. **Required.**
             *
             *     Every one of the five reports is about a single month, so a report without a
             *     period names nothing. Defaulting to the current month was the obvious
             *     alternative and was rejected for the reason `MyTimesheetQueryDto` rejects it:
             *     a client that forgot the parameter would silently get a different document on
             *     the 1st than on the 31st, and the bug would surface as somebody filing the
             *     wrong month's report.
             * @example 9
             */
            month: number;
            /**
             * @description The year. **Required**, for the same reason.
             * @example 2026
             */
            year: number;
            /**
             * @description `departmentId` — restricts every report to one organisational unit.
             *
             *     It is spelled `departmentId` rather than `teamId`, and that is not a
             *     shortening. **There is no team in this system**: `Employee` belongs to a
             *     `Department` and to a `Position`, and nothing anywhere models a team. A
             *     parameter named after a resource that does not exist would leave a client
             *     filtering by something it can never look up — the same call Feature 029 makes
             *     naming its permission resource `DEPARTMENTS`, and Feature 030 its timesheet
             *     filter.
             * @example clv8k2x9b000008l3fh7g2n1q
             */
            departmentId?: string;
            /**
             * @description `employeeId` — restricts every report to one person.
             *
             *     Meaningful on all five: a one-row attendance sheet or leave calendar is a
             *     perfectly ordinary thing to want, and on the two hour matrices it answers
             *     "what did this person work on".
             * @example clv8k2x9b000008l3fh7g2n1q
             */
            employeeId?: string;
            /**
             * @description `projectId` — restricts the two hour matrices to one project.
             *
             *     Ignored by reports 2, 3 and 4, which are about days rather than about work
             *     booked to something. Filtering an attendance sheet by project would be asking
             *     "which days did this person attend, considering only one project", and a day
             *     is not divisible that way — somebody present is present.
             * @example clv8k2x9b000008l3fh7g2n1q
             */
            projectId?: string;
            /** @description Trimmed; a blank value is treated as absent rather than as a filter on "". */
            clientName?: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    AppController_getGreeting_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["GreetingResponseDto"];
                    };
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    HealthController_check_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["HealthResponseDto"];
                    };
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    AuthController_login_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    /** @description The refresh token, as an `HttpOnly` cookie — e.g. `refresh_token=<jws>; Max-Age=604800; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax`. It is not readable from JavaScript and is not in the response body. `Max-Age` matches the token’s own lifetime, `Path` scopes it to the auth routes so it rides on nothing else, and `Secure` is set outside development. Name, path, `Secure` and `SameSite` are configurable per deployment. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["AuthSessionEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The credential in the request body was refused — there is no access token involved on a public route. `AUTH_INVALID_CREDENTIALS` covers all three login failures (no such address, wrong password, deactivated account) with one message and equalised timing, because splitting them would confirm that an address exists. `AUTH_REFRESH_TOKEN_INVALID` covers a refresh token that is malformed, expired, revoked or unknown; `AUTH_REFRESH_TOKEN_REUSED` is the one that is deliberately specific, because a spent token coming back means two parties hold one credential and every session has just been revoked. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    AuthController_refresh_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    /** @description The refresh token, as an `HttpOnly` cookie — e.g. `refresh_token=<jws>; Max-Age=604800; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax`. It is not readable from JavaScript and is not in the response body. `Max-Age` matches the token’s own lifetime, `Path` scopes it to the auth routes so it rides on nothing else, and `Secure` is set outside development. Name, path, `Secure` and `SameSite` are configurable per deployment. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["AuthSessionEntity"];
                    };
                };
            };
            /** @description The credential in the request body was refused — there is no access token involved on a public route. `AUTH_INVALID_CREDENTIALS` covers all three login failures (no such address, wrong password, deactivated account) with one message and equalised timing, because splitting them would confirm that an address exists. `AUTH_REFRESH_TOKEN_INVALID` covers a refresh token that is malformed, expired, revoked or unknown; `AUTH_REFRESH_TOKEN_REUSED` is the one that is deliberately specific, because a spent token coming back means two parties hold one credential and every session has just been revoked. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    AuthController_logout_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    /** @description Clears the refresh cookie — the same name, path and attributes with an expiry in the past. Sent whether or not the request carried one. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    AuthController_me_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["AuthUserEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    AuthController_activate_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActivateAccountDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    AuthController_forgotPassword_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ForgotPasswordDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["PasswordResetRequestedEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    AuthController_resetPassword_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResetPasswordDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    AuthController_changePassword_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChangePasswordDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmailController_checkHealth_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["EmailHealthResponseDto"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmailController_sendTestEmail_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TestEmailDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PermissionController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `key` **and** `label`.
                 *
                 *     Both, because the two are how the same permission is named in the two places
                 *     somebody comes from: an administrator reading a screen types `approve`,
                 *     while somebody reading a feature document or a future
                 *     `@RequirePermission()` types `LEAVE_REQUESTS.APPROVE`. `description` is
                 *     deliberately not searched — it is prose written to explain a cell, and
                 *     matching it would return rows whose key and label say nothing about the term.
                 *
                 *     Absent and empty are the same thing.
                 */
                search?: string;
                /** @description One row of the matrix: `?resource=TIMESHEET`. */
                resource?: "DASHBOARD" | "TIMESHEET" | "EMPLOYEES" | "LEAVE_REQUESTS" | "REPORTS" | "PROJECTS" | "LEAVES" | "WORK_SCHEDULE" | "PUBLIC_HOLIDAYS" | "DEPARTMENTS" | "NOTIFICATION_CONFIG" | "PERMISSIONS";
                /**
                 * @description One column of it: `?action=APPROVE` is "everything anybody can approve",
                 *     which is the question an administrator asks when deciding who signs off on
                 *     what.
                 */
                action?: "PAGE_ACCESS" | "VIEW" | "CREATE" | "EDIT" | "DELETE" | "APPROVE" | "CONFIGURE";
                /**
                 * @description Column to order by; only the enumerated ones reach Prisma's `orderBy`.
                 *
                 *     `resource` and `action` order by their enums' declaration order, which is
                 *     the order the matrix is drawn in — see the constants file for why that makes
                 *     `resource` the default rather than the project-wide `createdAt`.
                 */
                sortBy: "resource" | "action" | "key";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["PermissionResourceGroupEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PermissionController_findPresets_v1: {
        parameters: {
            query: {
                /**
                 * @description The role whose cards to return: `?targetRole=HR`.
                 *
                 *     Grouping rather than a constraint — a preset may be applied to any account
                 *     that is not a super-admin, so this narrows what is *shown* and not what may
                 *     be *used*. `?targetRole=SUPERADMIN` is a legal query that returns nothing,
                 *     which is the honest answer: a super-admin already holds everything, so no
                 *     preset is written for one.
                 */
                targetRole?: "SUPERADMIN" | "ADMIN" | "HR" | "USER";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["PermissionPresetEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PermissionController_findMyEffective_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["EffectivePermissionsEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserPermissionController_findMatrix_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["UserPermissionMatrixEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserPermissionController_replace_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetUserPermissionsDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["UserPermissionMatrixEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserPermissionController_resetToRole_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["UserPermissionMatrixEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserPermissionController_applyPreset_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ApplyPresetDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["UserPermissionMatrixEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserPermissionController_findHistory_v1: {
        parameters: {
            query: {
                /**
                 * @description One kind of change: `?action=PRESET_APPLIED` is the list of times somebody
                 *     was put on a preset, without the per-permission lines underneath.
                 *
                 *     Filtering to a summary action is the useful case and the reason this exists:
                 *     a busy account's history is mostly per-permission rows, and "when was this
                 *     person's access last reset" is otherwise a scroll.
                 */
                action?: "PERMISSION_GRANTED" | "PERMISSION_REVOKED" | "OVERRIDE_CLEARED" | "PRESET_APPLIED" | "RESET_TO_ROLE";
                /**
                 * @description Column to order by. Exactly one is offered — see
                 *     `PERMISSION_HISTORY_SORT_FIELDS` for why a chronology has no second
                 *     meaningful order.
                 */
                sortBy: "createdAt";
                /**
                 * @description Newest first unless asked otherwise.
                 *
                 *     Redeclared for the initialiser alone; the `@IsOptional()` and `@IsEnum()`
                 *     are inherited, because class-validator applies a parent's constraints to a
                 *     property a subclass overrides. Restating them here would register the same
                 *     rules twice and report a bad direction twice — the call
                 *     `NotificationQueryDto` already makes.
                 *
                 *     The second list in this project to depart from the shared ascending default,
                 *     and for the same reason as the first: a history is a feed, and the row that
                 *     matters is the one that arrived last.
                 */
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["PermissionAuditLogEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `email` and `username`.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /**
                 * @description Exact role. Validated against the enum, so it reaches Prisma as a value
                 *     the column can hold rather than as arbitrary text.
                 */
                role?: "SUPERADMIN" | "ADMIN" | "HR" | "USER";
                /**
                 * @description Exact account state — `?status=PENDING_ACTIVATION`.
                 *
                 *     **Replaced `?isActive=` in Feature 036**, along with the column behind it.
                 *     The boolean could answer two questions and the screen has three: the filter
                 *     an administrator actually reaches for on the accounts page is "who has not
                 *     accepted their invitation yet", and `?isActive=true` used to return those
                 *     people mixed in with everybody else. A client that filtered `?isActive=true`
                 *     now filters `?status=ACTIVE`, and one that filtered `?isActive=false` filters
                 *     `?status=DISABLED`.
                 *
                 *     Validated against the enum, so it reaches Prisma as a value the column can
                 *     hold rather than as arbitrary text.
                 */
                status?: "ACTIVE" | "PENDING_ACTIVATION" | "DISABLED";
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "email" | "username" | "role" | "createdAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["UserEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateUserDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["UserEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["UserEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateUserDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["UserEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserController_resendActivation_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserController_activate_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["UserEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    UserController_deactivate_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["UserEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    DepartmentController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `code` and `name`.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "code" | "name" | "createdAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["DepartmentEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    DepartmentController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateDepartmentDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["DepartmentEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    DepartmentController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["DepartmentEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    DepartmentController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    DepartmentController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateDepartmentDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["DepartmentEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PositionController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `code` and `name`.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "code" | "name" | "createdAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["PositionEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PositionController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePositionDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["PositionEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PositionController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["PositionEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PositionController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PositionController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdatePositionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["PositionEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Exact department. An id matching no department is not an error: it simply
                 *     matches no employee, and an empty page is the honest answer to "who works
                 *     in a department that does not exist".
                 */
                departmentId?: string;
                /** @description Exact position, on the same terms as `departmentId`. */
                positionId?: string;
                /**
                 * @description Case-insensitive substring matched against `employeeCode`, `firstName` and
                 *     `lastName`.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /**
                 * @description Exact seniority. Validated against the enum, so it reaches Prisma as a
                 *     value the column can hold rather than as arbitrary text.
                 */
                seniority?: "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD";
                /** @description Exact employment status, on the same terms as `seniority`. */
                status?: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TERMINATED";
                /** @description `?canReplaceOthers=true` / `=false`; anything else is a `400`. */
                canReplaceOthers?: boolean;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "employeeCode" | "firstName" | "lastName" | "hireDate" | "createdAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["EmployeeEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateEmployeeDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["EmployeeEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["EmployeeEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateEmployeeDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["EmployeeEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProjectMembersController_findRoster_v1: {
        parameters: {
            query: {
                /** @description `?isProjectManager=true` / `=false`; anything else is a 400. */
                isProjectManager?: boolean;
                /**
                 * @description `?activeOnly=true` keeps only the memberships that have not ended —
                 *     `leftAt IS NULL`.
                 *
                 *     `false` and *absent* mean the same thing, and the parameter is named for
                 *     that: "only the active ones" turned off is not "only the inactive ones", it
                 *     is the unfiltered listing. Historical memberships are part of the record,
                 *     so they are returned by default; a caller who wants the current state asks
                 *     for it explicitly.
                 *
                 *     The complement — memberships that *have* ended — is deliberately not
                 *     offered. Nobody has asked for it, and adding `?endedOnly=` alongside this
                 *     would create a pair of flags that can contradict each other.
                 */
                activeOnly?: boolean;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "joinedAt" | "leftAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ProjectRosterEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProjectMembersController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateProjectMemberDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ProjectMemberRosterEntry"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProjectMembersController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
                employeeId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ProjectMemberRosterEntry"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProjectMembersController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
                employeeId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProjectMembersController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                projectId: string;
                employeeId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateProjectMemberDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ProjectMemberRosterEntry"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeProjectsController_findAssignments_v1: {
        parameters: {
            query: {
                /** @description `?isProjectManager=true` / `=false`; anything else is a 400. */
                isProjectManager?: boolean;
                /**
                 * @description `?activeOnly=true` keeps only the memberships that have not ended —
                 *     `leftAt IS NULL`.
                 *
                 *     `false` and *absent* mean the same thing, and the parameter is named for
                 *     that: "only the active ones" turned off is not "only the inactive ones", it
                 *     is the unfiltered listing. Historical memberships are part of the record,
                 *     so they are returned by default; a caller who wants the current state asks
                 *     for it explicitly.
                 *
                 *     The complement — memberships that *have* ended — is deliberately not
                 *     offered. Nobody has asked for it, and adding `?endedOnly=` alongside this
                 *     would create a pair of flags that can contradict each other.
                 */
                activeOnly?: boolean;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "joinedAt" | "leftAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path: {
                employeeId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["EmployeeProjectsEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProjectController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `code`, `name` and `clientName`.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /** @description `?isArchived=true` / `=false`; anything else is a `400`. */
                isArchived?: boolean;
                /**
                 * @description Exact lifecycle state, e.g. `?projectStatus=ON_HOLD`.
                 *
                 *     Validated against the enum, so it reaches Prisma as a value the column can
                 *     hold rather than as arbitrary text.
                 */
                projectStatus?: "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
                /** @description Exact priority, on the same terms as `projectStatus`. */
                projectPriority?: "MEDIUM" | "LOW" | "HIGH";
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "code" | "name" | "clientName" | "estimatedHours" | "startDate" | "createdAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["ProjectEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProjectController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateProjectDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ProjectEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProjectController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ProjectEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProjectController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProjectController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateProjectDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ProjectEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProfileController_findOwn_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ProfileEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ProfileController_updateOwn_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateProfileDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ProfileEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    WorkScheduleController_find_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["WorkScheduleEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    WorkScheduleController_save_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateWorkScheduleDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["WorkScheduleEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    WorkScheduleController_findEmails_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["TimesheetApprovalEmailEntity"][];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    WorkScheduleController_addEmail_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateTimesheetApprovalEmailDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["TimesheetApprovalEmailEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    WorkScheduleController_removeEmail_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PublicHolidayController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `name`.
                 *
                 *     `name` alone, not `description`: the description is prose about the
                 *     holiday, and matching it would make a search for "day" return everything
                 *     that merely mentions one.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /** @description `?type=FIXED` / `=VARIABLE`; validated against the enum. */
                type?: "FIXED" | "VARIABLE";
                /** @description `?isNational=true` / `=false`; anything else is a `400`. */
                isNational?: boolean;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "name" | "startDate" | "createdAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["PublicHolidayEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PublicHolidayController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePublicHolidayDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["PublicHolidayEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PublicHolidayController_findYear_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                year: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["PublicHolidayOccurrenceEntity"][];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PublicHolidayController_findMonth_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                year: number;
                month: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["PublicHolidayOccurrenceEntity"][];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PublicHolidayController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["PublicHolidayEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PublicHolidayController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    PublicHolidayController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdatePublicHolidayDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["PublicHolidayEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveTypesController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `code` and `label`.
                 *
                 *     Those two, not `description`: the description is prose about the leave type,
                 *     and matching it would make a search for "leave" return everything that
                 *     merely mentions it.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /** @description `?isActive=true` / `=false`; anything else is a `400`. */
                isActive?: boolean;
                /** @description `?requiresApproval=true` / `=false`, on the same terms. */
                requiresApproval?: boolean;
                /** @description `?isPaid=true` / `=false`, on the same terms. */
                isPaid?: boolean;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "code" | "label" | "defaultAllocatedDays" | "createdAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["LeaveTypeEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveTypesController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateLeaveTypeDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["LeaveTypeEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveTypesController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["LeaveTypeEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveTypesController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveTypesController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateLeaveTypeDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["LeaveTypeEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveNotificationEmailsController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `email`.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "email" | "createdAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["LeaveNotificationEmailEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveNotificationEmailsController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateLeaveNotificationEmailDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["LeaveNotificationEmailEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveNotificationEmailsController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveNotificationEmailsController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateLeaveNotificationEmailDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["LeaveNotificationEmailEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeLeaveBalancesController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Exact leave type. An id matching no leave type is not an error: it simply
                 *     matches no balance, and an empty page is the honest answer to "who has a
                 *     balance in a leave type that does not exist".
                 */
                leaveTypeId?: string;
                /**
                 * @description Exact department, matched through the employee.
                 *
                 *     A balance has no department of its own — the person does — so this narrows
                 *     on `employee.departmentId`. That is what makes "the Development team's 2026
                 *     annual leave" one request rather than a client fetching the department's
                 *     employees and then filtering balances by hand.
                 */
                departmentId?: string;
                /**
                 * @description Case-insensitive substring matched against the **employee's**
                 *     `employeeCode`, `firstName` and `lastName`.
                 *
                 *     The searchable text belongs to the related row rather than to this one: a
                 *     balance is three numbers and a year, and nobody looks one up by typing `21`.
                 *     The leave type is not searched either — it is a closed vocabulary, so
                 *     `?leaveTypeId=` answers that exactly, where a substring would guess.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /**
                 * @description Exact year: `?year=2026`.
                 *
                 *     `@Type(() => Number)` is mandatory, not decoration: a query parameter is
                 *     text, so without it `@IsInt()` would reject every request. This is the
                 *     opposite call from the body DTO, where `"2026"` is a payload the client
                 *     should fix — the difference is that a query string has no other way to carry
                 *     a number.
                 */
                year?: number;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "employee" | "year" | "allocatedDays" | "usedDays" | "createdAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["EmployeeLeaveBalanceEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeLeaveBalancesController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateEmployeeLeaveBalanceDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["EmployeeLeaveBalanceEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeLeaveBalancesController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["EmployeeLeaveBalanceEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeLeaveBalancesController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeLeaveBalancesController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateEmployeeLeaveBalanceDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["EmployeeLeaveBalanceEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    EmployeeLeaveBalancesController_generate_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GenerateLeaveBalancesDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["LeaveBalanceGenerationReport"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    MyLeaveRequestsController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Exact year, matched against the year the absence **begins** in.
                 *
                 *     A request running from December into January belongs to the year it started,
                 *     and appears once. Counting it under both would report two absences where
                 *     there is one — the same call `PublicHolidayService` makes for a variable
                 *     holiday spanning New Year, and made the same way so the two do not disagree.
                 */
                year?: number;
                /**
                 * @description Exact leave type. An id matching no leave type is not an error: it simply
                 *     matches no request, and an empty page is the honest answer to "what was
                 *     taken of a leave type that does not exist".
                 *
                 *     Named `leaveTypeId` rather than `leaveType`, matching
                 *     `EmployeeLeaveBalanceQueryDto`: the value is an id, and a parameter whose
                 *     name suggests a code would invite clients to send `ANNUAL`.
                 */
                leaveTypeId?: string;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "startDate" | "endDate" | "status" | "createdAt";
                /**
                 * @description Exact lifecycle state.
                 *
                 *     `@IsEnum` over the full `LeaveRequestStatus`, including `PENDING` — unlike
                 *     the status *body*, which refuses it. Filtering for what is still waiting is
                 *     the single most useful thing this parameter does; what it must not do is
                 *     *set* that state.
                 */
                status?: "CANCELLED" | "PENDING" | "APPROVED" | "REJECTED";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["MyLeaveRequestEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    MyLeaveRequestsController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateLeaveRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["MyLeaveRequestEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    MyLeaveRequestsController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["MyLeaveRequestEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    MyLeaveRequestsController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    MyLeaveRequestsController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateLeaveRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["MyLeaveRequestEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveRequestsController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description The current year unless one is asked for.
                 *
                 *     Redeclared for the initialiser alone — the bounds and the coercion are
                 *     inherited, because class-validator applies a parent's constraints to a
                 *     property a subclass overrides. Restating `@IsLeaveRequestQueryYear()` here
                 *     would register the same three rules twice and report a bad year twice.
                 *
                 *     The default is computed per instance rather than captured once at module
                 *     load: a process running across midnight on 31 December would otherwise keep
                 *     defaulting to the year it started in, and would go on doing so until
                 *     somebody restarted it.
                 */
                year: number;
                /**
                 * @description Exact leave type. An id matching no leave type is not an error: it simply
                 *     matches no request, and an empty page is the honest answer to "what was
                 *     taken of a leave type that does not exist".
                 *
                 *     Named `leaveTypeId` rather than `leaveType`, matching
                 *     `EmployeeLeaveBalanceQueryDto`: the value is an id, and a parameter whose
                 *     name suggests a code would invite clients to send `ANNUAL`.
                 */
                leaveTypeId?: string;
                /**
                 * @description Exact department, matched through the employee.
                 *
                 *     A request has no department of its own — the person does — so this narrows
                 *     on `employee.departmentId`. That is what makes "who in Development is off
                 *     this year" one request rather than a client fetching the department's
                 *     employees and filtering requests by hand.
                 */
                departmentId?: string;
                /**
                 * @description One person's requests, read by HR rather than by that person.
                 *
                 *     It is a filter here and not on `/me` because here it genuinely narrows a
                 *     cross-cutting list, while there it would be a second way to state a scope
                 *     the header already fixed. The two endpoints answer different questions: this
                 *     one is "show me Ion's leave", `/me` is "show me mine".
                 */
                employeeId?: string;
                /**
                 * @description Case-insensitive substring matched against the **employee's**
                 *     `employeeCode`, `firstName` and `lastName`.
                 *
                 *     The searchable text belongs to the related row rather than to this one: a
                 *     request is two dates and a status, and nobody looks one up by typing
                 *     `approved`. The leave type is not searched either — it is a closed
                 *     vocabulary, so `?leaveTypeId=` answers that exactly, where a substring would
                 *     guess.
                 *
                 *     `reason` is deliberately not searched. It is free text an employee wrote
                 *     about their own absence, and making it findable across the company would
                 *     turn a note into a record everybody queries.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /** @description The wider list, which adds ordering by the person. */
                sortBy: "startDate" | "endDate" | "status" | "createdAt" | "employee";
                /**
                 * @description Exact lifecycle state.
                 *
                 *     `@IsEnum` over the full `LeaveRequestStatus`, including `PENDING` — unlike
                 *     the status *body*, which refuses it. Filtering for what is still waiting is
                 *     the single most useful thing this parameter does; what it must not do is
                 *     *set* that state.
                 */
                status?: "CANCELLED" | "PENDING" | "APPROVED" | "REJECTED";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["LeaveRequestEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveRequestsController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["LeaveRequestEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    LeaveRequestsController_updateStatus_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateLeaveRequestStatusDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["LeaveRequestEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `title` **and** `message`.
                 *
                 *     Both, because a notification's title is a summary somebody wrote and the
                 *     detail a person half-remembers — a project code, a colleague's name, a date
                 *     — is usually in the body. Searching the title alone would fail on exactly
                 *     the query people actually type.
                 *
                 *     Nothing else is searched. `category`, `type` and `priority` are closed
                 *     vocabularies with exact filters of their own, where a substring would guess.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /** @description Exact category: `?category=LEAVE`. */
                category?: "TIMESHEET" | "GENERAL" | "SYSTEM" | "LEAVE" | "REMINDER" | "MAINTENANCE";
                /** @description Exact severity: `?type=ERROR`. */
                type?: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
                /** @description Exact priority: `?priority=HIGH`. */
                priority?: "MEDIUM" | "LOW" | "HIGH";
                /**
                 * @description Read state: `?isRead=false` is the unread inbox, which is what this
                 *     parameter is really for.
                 *
                 *     `@ToBoolean()` before `@IsBoolean()` because a query string is text, so
                 *     `"false"` would otherwise be rejected — the boolean counterpart of the
                 *     `@Type(() => Number)` that `PaginationQueryDto` puts on `page`. Only the two
                 *     exact spellings convert; `?isRead=yes` is a `400` naming the field rather
                 *     than a filter nobody asked for.
                 *
                 *     No initialiser: absent means "both", which is not a value a boolean could
                 *     carry.
                 */
                isRead?: boolean;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "createdAt" | "priority" | "title";
                /**
                 * @description Newest first unless asked otherwise — the one list in this project that
                 *     defaults to `desc`.
                 *
                 *     Redeclared for the initialiser alone; the `@IsOptional()` and `@IsEnum()`
                 *     are inherited, because class-validator applies a parent's constraints to a
                 *     property a subclass overrides. Restating them here would register the same
                 *     rules twice and report a bad direction twice — the same call
                 *     `LeaveRequestQueryDto` makes when it redeclares `year`.
                 *
                 *     The reason for the departure is what the resource is. Every other collection
                 *     in this API is a register read in a stable order somebody chose; an inbox is
                 *     a feed, where the row that matters is the one that arrived last. Opening
                 *     every notification list on its oldest message would be a default nobody
                 *     wants and everybody overrides.
                 */
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["NotificationEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateNotificationDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["NotificationEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationController_removeAll_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["NotificationBulkResult"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationController_markAllRead_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["NotificationBulkResult"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["NotificationEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationController_markRead_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["NotificationEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    AdministrativeNotificationController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `title` **and** `message`.
                 *
                 *     Both, because a notification's title is a summary somebody wrote and the
                 *     detail a person half-remembers — a project code, a colleague's name, a date
                 *     — is usually in the body. Searching the title alone would fail on exactly
                 *     the query people actually type.
                 *
                 *     Nothing else is searched. `category`, `type` and `priority` are closed
                 *     vocabularies with exact filters of their own, where a substring would guess.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /** @description Exact category: `?category=LEAVE`. */
                category?: "TIMESHEET" | "GENERAL" | "SYSTEM" | "LEAVE" | "REMINDER" | "MAINTENANCE";
                /** @description Exact severity: `?type=ERROR`. */
                type?: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
                /** @description Exact priority: `?priority=HIGH`. */
                priority?: "MEDIUM" | "LOW" | "HIGH";
                /**
                 * @description Read state: `?isRead=false` is the unread inbox, which is what this
                 *     parameter is really for.
                 *
                 *     `@ToBoolean()` before `@IsBoolean()` because a query string is text, so
                 *     `"false"` would otherwise be rejected — the boolean counterpart of the
                 *     `@Type(() => Number)` that `PaginationQueryDto` puts on `page`. Only the two
                 *     exact spellings convert; `?isRead=yes` is a `400` naming the field rather
                 *     than a filter nobody asked for.
                 *
                 *     No initialiser: absent means "both", which is not a value a boolean could
                 *     carry.
                 */
                isRead?: boolean;
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "createdAt" | "priority" | "title";
                /**
                 * @description Newest first unless asked otherwise — the one list in this project that
                 *     defaults to `desc`.
                 *
                 *     Redeclared for the initialiser alone; the `@IsOptional()` and `@IsEnum()`
                 *     are inherited, because class-validator applies a parent's constraints to a
                 *     property a subclass overrides. Restating them here would register the same
                 *     rules twice and report a bad direction twice — the same call
                 *     `LeaveRequestQueryDto` makes when it redeclares `year`.
                 *
                 *     The reason for the departure is what the resource is. Every other collection
                 *     in this API is a register read in a stable order somebody chose; an inbox is
                 *     a feed, where the row that matters is the one that arrived last. Opening
                 *     every notification list on its oldest message would be a default nobody
                 *     wants and everybody overrides.
                 */
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["NotificationEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    AdministrativeNotificationController_removeAll_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["NotificationBulkResult"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    AdministrativeNotificationController_markAllRead_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["NotificationBulkResult"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ReminderController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `name` **and** `subject`.
                 *
                 *     Those two rather than the body, because they are what a reminder is
                 *     identified by: the name is what an administrator called the rule and the
                 *     subject is what the recipient will see. The `message` is a paragraph of
                 *     boilerplate that would match half the table on any common word — the
                 *     opposite of the notification centre's call, where the body is searched
                 *     precisely because the detail somebody half-remembers is in it.
                 *
                 *     Absent and empty are the same thing — an empty term would match every row,
                 *     which is what the endpoint already does without it.
                 */
                search?: string;
                /**
                 * @description Whether the rule is switched on: `?enabled=true` is the set the delivery
                 *     engine will act on, which is the question this filter exists for.
                 *
                 *     `@ToBoolean()` before `@IsBoolean()` because a query string is text, so
                 *     `"false"` would otherwise be rejected — the boolean counterpart of the
                 *     `@Type(() => Number)` that `PaginationQueryDto` puts on `page`. Only the two
                 *     exact spellings convert; `?enabled=yes` is a `400` naming the field rather
                 *     than a filter nobody asked for.
                 *
                 *     No initialiser: absent means "both", which is not a value a boolean could
                 *     carry.
                 */
                enabled?: boolean;
                /** @description Exact severity: `?severity=WARNING`. */
                severity?: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
                /** @description Exact priority: `?priority=HIGH`. */
                priority?: "MEDIUM" | "LOW" | "HIGH";
                /** @description Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
                sortBy: "createdAt" | "priority" | "subject";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["ReminderEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ReminderController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateReminderDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ReminderEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ReminderController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ReminderEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ReminderController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ReminderController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateReminderDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ReminderEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationCampaignController_findAll_v1: {
        parameters: {
            query: {
                /**
                 * @description Case-insensitive substring matched against `subject` **and** `message`.
                 *
                 *     Both, because a campaign's subject is a summary somebody wrote and the
                 *     detail a person half-remembers — a date, a building, a system name — is
                 *     usually in the body. This is the notification centre's call rather than the
                 *     reminder list's, and for the reason the two differ: a reminder's body is
                 *     boilerplate that would match half the table, while every campaign says
                 *     something different.
                 *
                 *     Absent and empty are the same thing.
                 */
                search?: string;
                /**
                 * @description Exact lifecycle state: `?status=DRAFT` is the queue of things somebody
                 *     started and has not scheduled.
                 *
                 *     The whole enum is filterable, `SENT` included: a client may not *write* that
                 *     status, but reading what has already gone out is the point of keeping the
                 *     record.
                 */
                status?: "CANCELLED" | "DRAFT" | "SCHEDULED" | "SENT";
                /** @description Exact severity: `?severity=ERROR`. */
                severity?: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
                /** @description Exact priority: `?priority=HIGH`. */
                priority?: "MEDIUM" | "LOW" | "HIGH";
                /**
                 * @description The two delivery switches, filterable independently — "which announcements
                 *     will leave the system as email" is a question an administrator asks before
                 *     anything is sent.
                 *
                 *     `@ToBoolean()` before `@IsBoolean()` because a query string is text, so
                 *     `"false"` would otherwise be rejected. Only the two exact spellings convert.
                 */
                sendEmail?: boolean;
                sendNotification?: boolean;
                /**
                 * @description Column to order by; only the enumerated ones reach Prisma's `orderBy`.
                 *
                 *     `scheduledAt` is nullable, so a `DRAFT` campaign sorts last ascending and
                 *     first descending — PostgreSQL's own null ordering, left as it is rather than
                 *     overridden with an opinion this API would then have to defend.
                 */
                sortBy: "createdAt" | "priority" | "subject" | "scheduledAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["NotificationCampaignSummaryEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationCampaignController_create_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateNotificationCampaignDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["NotificationCampaignEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationCampaignController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["NotificationCampaignEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationCampaignController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationCampaignController_update_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateNotificationCampaignDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["NotificationCampaignEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    NotificationDeliveryController_execute_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                campaignId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["DeliveryResultEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    TimesheetController_findOwn_v1: {
        parameters: {
            query: {
                month: number;
                year: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["TimesheetEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    TimesheetController_openOwn_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateTimesheetDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["TimesheetEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    TimesheetController_setOwnEntries_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetTimesheetEntriesDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["TimesheetEntity"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    TimesheetController_submitOwn_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["TimesheetEntity"];
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimesheetEntity"];
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    TimesheetController_findAll_v1: {
        parameters: {
            query: {
                /** @description `?month=` — narrows to one period. Combines with `year` by `AND`. */
                month?: number;
                year?: number;
                /**
                 * @description `?departmentId=` — the organisational unit the owner belongs to.
                 *
                 *     Reaches through the `employee` relation, since a department is not a column
                 *     of this table. Compared exactly: it is an opaque key a client copies from a
                 *     previous response, not something anybody types, so folding its case would
                 *     only make the comparison slower.
                 *
                 *     It is spelled `departmentId` rather than `teamId` for the reason Feature 029
                 *     gives for naming its permission resource `DEPARTMENTS`: there is no team in
                 *     this system, and a parameter named after a screen that does not exist would
                 *     leave a client filtering by something they cannot find.
                 */
                departmentId?: string;
                /**
                 * @description `?search=` — matched against the employee's name, code and position.
                 *
                 *     Case-insensitive and trimmed. Bounded so a huge term cannot be pushed into a
                 *     `LIKE` scan; an empty string after trimming is treated as no search rather
                 *     than as a term that matches everything.
                 */
                search?: string;
                /**
                 * @description `?status=` — where the month stands.
                 *
                 *     Validated against the whole `TimesheetStatus` enum rather than only the three
                 *     an administrator can see, so the parameter means the same thing here as
                 *     everywhere else in the API. What it can actually *return* is decided by the
                 *     service, which intersects it with the visible set.
                 */
                status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
                /**
                 * @description `?sortBy=` — one of a closed list, because the value reaches Prisma's
                 *     `orderBy` key.
                 *
                 *     The default is a property initialiser, the same technique `PaginationQueryDto`
                 *     uses: an absent parameter leaves it in place, so the service always receives a
                 *     concrete column and never has to apply a fallback of its own.
                 *
                 *     `totalHours` is not among them, and the reason is worth reading before
                 *     assuming it was forgotten — see {@link TIMESHEET_SORT_FIELDS}.
                 */
                sortBy: "submittedAt" | "status" | "employee" | "createdAt";
                sortOrder: "asc" | "desc";
                /** @description 1-based page number. */
                page: number;
                /** @description Records per page, capped so one request cannot drain a table. */
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: {
                            items: components["schemas"]["TimesheetListRowEntity"][];
                            meta: components["schemas"]["PaginationMeta"];
                        };
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    TimesheetController_findOne_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["TimesheetEntity"];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    TimesheetController_remove_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        /**
                         * @description Always `null` — the action succeeded and returns no body.
                         * @example null
                         */
                        data: unknown;
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    TimesheetController_approve_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["TimesheetEntity"];
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimesheetEntity"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    TimesheetController_reject_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RejectTimesheetDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["TimesheetEntity"];
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimesheetEntity"];
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 404,
                     *       "message": "Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found",
                     *       "path": "/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ReportingController_findAll_v1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ReportDefinitionEntity"][];
                    };
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ReportingController_preview_v1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reportType: "project-hours-per-employee" | "timesheet-status" | "attendance-sheet" | "leave-calendar" | "employee-hours-per-project";
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReportQueryDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Always `true`. The discriminant a client reads before anything else.
                         * @enum {boolean}
                         */
                        success: true;
                        data: components["schemas"]["ReportDataModel"];
                    };
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    ReportingController_exportReport_v1: {
        parameters: {
            query: {
                /**
                 * @description `pdf` or `excel`. **Required** — there is no default.
                 *
                 *     A default was rejected because the two produce genuinely different artefacts
                 *     for different purposes: a PDF is the document somebody signs and files, an
                 *     xlsx is the grid somebody pivots. Guessing which one a caller meant would
                 *     send the wrong one silently, and the caller only finds out after the
                 *     download.
                 *
                 *     Validated against a closed list, since the value chooses a renderer and sets
                 *     a `Content-Type`: anything not enumerated has to be rejected before it
                 *     reaches either. Trimmed and matched exactly — `?format=PDF` is refused rather
                 *     than folded, so the API has one spelling for each format.
                 */
                format: "pdf" | "excel";
            };
            header?: never;
            path: {
                reportType: "project-hours-per-employee" | "timesheet-status" | "attendance-sheet" | "leave-calendar" | "employee-hours-per-project";
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReportQueryDto"];
            };
        };
        responses: {
            /** @description The rendered document. `Content-Type` is `application/pdf` or the Excel media type, depending on `?format=`. */
            200: {
                headers: {
                    /** @description Carries the generated filename, e.g. `attachment; filename="raport-2026-08.xlsx"`. */
                    "Content-Disposition"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description The request body, query or path failed validation. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an unknown property is rejected by name rather than ignored. `message` is an array with one entry per rejected field and `errorCode` is `VALIDATION_ERROR`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: `ACCOUNT_TOKEN_INVALID` on `POST /auth/activate` and `POST /auth/reset-password`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and `params.purpose` says which kind of link it was. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global `JwtAuthGuard` before any handler runs; `errorCode` is `AUTH_UNAUTHENTICATED`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: `AUTH_INACTIVE_USER` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on `GET /auth/me` and on `POST /auth/refresh`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and `ACCOUNT_CURRENT_PASSWORD_INCORRECT`, only on `POST /auth/change-password`, where the session is fine and it is the `currentPassword` in the body that was wrong. The message does not distinguish them; the code does. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The caller is authenticated and may not do this. `AUTHORIZATION_PERMISSION_DENIED` comes from `PermissionsGuard` and carries `requiredPermissions` and `mode` in `params`; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; `AUTH_NO_EMPLOYEE_RECORD` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers `403` with `AUTH_UNAUTHENTICATED`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description The rate limiter refused the request; `errorCode` is `RATE_LIMIT_EXCEEDED`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the `Retry-After` header: retrying immediately extends the block rather than shortening it. */
            429: {
                headers: {
                    /** @description Seconds to wait before the next attempt. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 429,
                     *       "message": "Too many requests; please wait before trying again",
                     *       "errorCode": "RATE_LIMIT_EXCEEDED",
                     *       "path": "/api/v1/auth/login",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Something the application did not anticipate. The message is the fixed sentence `Internal server error` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and `errorCode` is `INTERNAL_ERROR`. The detail is in the server log. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": false,
                     *       "statusCode": 500,
                     *       "message": "Internal server error",
                     *       "errorCode": "INTERNAL_ERROR",
                     *       "path": "/api/v1/employees",
                     *       "timestamp": "2026-08-12T08:36:11.816Z"
                     *     }
                     */
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
}
