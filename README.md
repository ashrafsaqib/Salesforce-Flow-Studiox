# Flow Studiox

Understand and edit Salesforce Flows through conversation with Claude. Flow Studiox is a dependency-free Chrome extension that reads saved Flow XML, answers questions, and saves requested changes as a new draft in Salesforce Flow Builder.

> **Safety warning:** Flow Studiox is not recommended for production use. Use it only with a sandbox or test org. When you finish using it, disable the Salesforce External Client App (or Connected App) configured for OAuth to prevent further access.

[![Flow Studiox: understand Salesforce Flows and change them through conversation](flow-studiox-linkedin-banner.png)](https://youtu.be/nemAxwR_bLE?si=CyEqwO15f_n4rr92)

**[Watch the demo and installation walkthrough on YouTube](https://youtu.be/nemAxwR_bLE?si=CyEqwO15f_n4rr92)**

## What you can do

| Mode | Use it to | Result |
| --- | --- | --- |
| **Understand** (default) | Ask what a flow does, how decisions work, or which records it changes. | Explanations based on the loaded Salesforce version, with follow-up questions supported. No deployment. |
| **Edit** | Describe a change to the loaded flow. | Validated XML automatically saved as a new **Draft** and opened in Flow Builder. The flow is never activated. |

Each mode keeps its own conversation and unfinished prompt. In Edit, you can download the generated XML, adjust it manually, or retry a failed save. Expand **View activity** for retrieval, generation, validation, and deployment details, timings, and errors.

## Install and connect

You need Chrome, a Salesforce user with API access and metadata deployment/flow management permissions, and a Claude API key with access to your chosen model. A Salesforce administrator must complete the [OAuth setup](#one-time-salesforce-administrator-setup) before your first connection.

1. Download or clone this repository. Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**. Select the repository folder containing `manifest.json`.
2. Pin **Flow Studiox**, open the latest saved version of a flow in Salesforce Flow Builder, and click the extension icon.
3. Click **Connect** or the header settings button. Confirm the detected Salesforce instance URL, enter your administrator's **Consumer Key (Client ID)**, and click **Connect Salesforce**. Complete login and consent.
4. Enter your **Claude API key**, a model available to your account, and a supported **Salesforce API version**. Click **Save connection**.
5. Click **Load opened flow** if the flow has not loaded automatically. If detection fails, enter its Flow API name.
6. Ask a question in **Understand**, or switch to **Edit** and describe a change. Send with **Ctrl+Enter** (**Cmd+Enter** on Mac), or use the send button.

Keep the extension window open until the request finishes. The Salesforce indicator turns green after API access is verified; this does not verify deployment permission or Claude connectivity. Flow selection appears once Salesforce access is verified.

### One-time Salesforce administrator setup

1. Load the extension and open **Connect**. Copy the displayed **OAuth callback URL**: `https://<extension-id>.chromiumapp.org/salesforce`.
2. In Salesforce Setup, create an **External Client App**, or use a compatible Connected App. Enable OAuth and set the callback URL to the exact value copied above.
3. Enable **Manage user data via APIs (`api`)** and the authorization code/web server flow where required. Enable **Require Proof Key for Code Exchange (PKCE)** and disable **Require Secret for Web Server Flow**. The extension uses no client secret.
4. Configure access policies for the intended users. If administrator preapproval is required, assign access through profiles or permission sets. Save and allow time for the settings to propagate.
5. Copy the app's **Consumer Key (Client ID)** into the extension.

Unpacked extension IDs can change across paths or machines. Register the callback shown by each installation, or distribute a packaged extension with a stable ID. If login fails, check the callback, access policies, PKCE, and client-secret requirement. See [Salesforce OAuth setup](https://help.salesforce.com/s/articleView?id=sf.configure_external_client_app_oauth_settings.htm&language=en_US&type=5) and [Chrome Identity](https://developer.chrome.com/docs/extensions/reference/api/identity).

## Working with flows

- **Saved versions only.** The extension reads the latest saved metadata by Flow API name. Older opened versions are rejected, and unsaved canvas changes are excluded.
- **Context follows the flow.** Understand uses up to six recent question/answer pairs; that history resets when the loaded flow or version changes. Explanations exclude unsaved XML edits. Edit requests send the current instruction and XML, rather than the full transcript.
- **Drafts stay reviewable.** XML is checked locally for its root, namespace, and draft status; Salesforce performs schema and org validation. Clarification requests, incomplete output, and invalid XML are not saved. Claude has no org schema, so unknown fields may require clarification. Deployment errors remain visible with XML available for correction or retry.
- **Concurrent edits are checked.** The extension checks the source version and timestamp before saving. Changes after that check are still possible, so avoid simultaneous edits.
- **Navigation has a fallback.** After saving, the extension opens the latest available version, even if Salesforce keeps the same version number. If lookup or navigation fails, it opens the Salesforce Flows list. A closed source tab or a tab in another org causes a new tab to open. XML is refreshed from Salesforce for subsequent requests.
- **Work can recover.** The open extension retains its flow and conversation when the Salesforce tab closes or refreshes. The flow name and org are saved locally for later recovery; a failed reload keeps the previous context. Pending deployment details and XML are also saved so reopening with the same connection can resume polling. Closing the window interrupts retrieval or generation, but does not cancel an existing Salesforce deployment. Navigation failures do not trigger a second deployment.

## Authentication and data

Salesforce login uses OAuth authorization code + PKCE (S256) through Chrome Identity, with callback and random-state verification. The extension exchanges the code directly with Salesforce and uses the returned instance URL. It does not collect a client secret, scrape session cookies, or request refresh tokens. Reconnect when an access token expires or is revoked. Switching orgs clears the old Salesforce token from the current window.

Connection settings and credentials—including the Salesforce access token and Claude key—are saved in `chrome.storage.local`. They persist in the current Chrome profile across restarts and extension reloads, are not synced to other devices, and remain until cleared or the extension is uninstalled. Storage is restricted to trusted extension contexts, but is not an encrypted credentials vault. Salesforce sign-in saves its token automatically; use **Save connection** to persist the other settings.

**Sending a request transmits the loaded Flow XML and your prompt directly to Anthropic.** Flow XML may contain sensitive business logic and literal values. Never distribute a shared API key with the extension; use a trusted server to hold the Claude key for a centrally distributed production app.

## Technical notes

- Chrome Manifest V3; no runtime dependencies, remote scripts, or build step.
- Uses Salesforce Metadata API for reading/deployment and Tooling API for flow identity, version checks, and saved-version lookup.
- Host permissions cover Salesforce and Anthropic. Custom non-Salesforce domains require a manifest change.
- Test live Salesforce and Claude integration with your credentials in a sandbox org before production use.

API references: [Salesforce readMetadata](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_readMetadata.htm), [Salesforce deploy](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_deploy.htm), [Claude API](https://platform.claude.com/docs/en/api/overview).
