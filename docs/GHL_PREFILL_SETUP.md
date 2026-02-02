# GHL Landing Page Prefill Setup Guide

This guide explains how to set up the token-based prefill system that correlates GHL landing page submissions with browser sessions on our tax planning app.

## Overview

The prefill system uses a correlation token to link:
1. A browser session on our domain (via HttpOnly cookie)
2. A form submission on the GHL landing page (via custom field)
3. Prefill data stored server-side (keyed by token)

**Flow:**
1. User visits `https://YOUR_APP_DOMAIN/start` (our domain)
2. `/start` generates a token, sets it as a cookie, and redirects to GHL landing page with `?tp_session=<token>`
3. GHL landing page form includes a hidden field that captures the token
4. On form submission, GHL webhook sends the token in custom fields
5. Our webhook stores prefill data (firstName, email, phone) keyed by token
6. User visits `/intake` on our domain, which reads the cookie and fetches prefill data

## Step 1: Create Custom Field in GHL

1. In your GHL account, go to **Settings** → **Custom Fields**
2. Create a new custom field:
   - **Field Name/Key:** `tp_session`
   - **Field Type:** Text
   - **Visibility:** Hidden (or visible if you want to debug)
3. Add this field to your landing page form

## Step 2: Add JavaScript to GHL Landing Page

Add the following JavaScript snippet to your GHL landing page. This code reads the `tp_session` token from the URL query parameter and sets it in the hidden form field before submission.

### JavaScript Snippet

```javascript
(function () {
  function getParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name) || "";
  }
  var token = getParam("tp_session");
  if (!token) return;

  // Try common selectors; adjust input name/id to match how GHL renders it.
  // You MUST update the selector to the actual hidden field on the GHL page.
  var el =
    document.querySelector('input[name="tp_session"]') ||
    document.querySelector('input[id="tp_session"]') ||
    document.querySelector('input[data-field="tp_session"]');

  if (el) el.value = token;
})();
```

### Implementation Notes

1. **Placement:** Add this script to your GHL landing page, ideally:
   - In the page footer/scripts section
   - Or in a custom HTML block
   - Or via GHL's custom JavaScript feature

2. **Selector Update Required:** 
   - GHL may render the custom field with a different name/id/attribute
   - Inspect the rendered HTML to find the actual selector
   - Update the `document.querySelector()` calls to match your form
   - Common patterns:
     - `input[name="customFields[tp_session]"]`
     - `input[id="ghl_custom_tp_session"]`
     - `input[data-custom-field="tp_session"]`

3. **Testing:**
   - Visit `/start?utm_source=test` to get redirected with token
   - Check browser console for any selector errors
   - Verify the hidden field value is set before form submission

## Step 3: Configure Environment Variables

Set the following environment variable in your app:

```bash
GHL_LANDING_URL=https://your-ghl-landing-page.com
```

This is the URL that `/start` will redirect to. It should be your GHL landing page URL.

## Step 4: User Entry Link

**Recommended entry point for prospects:**

```
https://YOUR_APP_DOMAIN/start
```

The `/start` route will:
- Generate a correlation token
- Set it as an HttpOnly cookie on your domain
- Redirect to the GHL landing page with the token in the URL
- Preserve any UTM parameters (e.g., `?utm_source=facebook&utm_campaign=test`)

**Example:**
- User clicks: `https://taxapp.example.com/start?utm_source=facebook`
- Gets redirected to: `https://your-ghl-landing-page.com?tp_session=abc-123-def&utm_source=facebook`

## Step 5: Webhook Configuration

Ensure your GHL webhook is configured to send custom fields. The webhook payload should include:

- `contact.customFields` array (with `name`/`key`/`value` properties)
- OR `custom_fields` object at root level
- OR `contact.custom_fields` object

The webhook handler will look for a custom field with key/name `tp_session` and extract the token value.

## Testing Checklist

1. ✅ Visit `/start` and verify redirect to GHL with `?tp_session=...`
2. ✅ Check browser cookies: `tp_session` cookie should be set (HttpOnly)
3. ✅ Submit GHL form and verify token is included in webhook payload
4. ✅ Visit `/intake` and verify form fields are prefilled
5. ✅ Refresh `/intake` and verify fields are NOT prefilled again (one-time read)
6. ✅ Wait 60+ minutes and verify expired prefill data is not returned

## Troubleshooting

### Prefill not working

1. **Check token in URL:** Visit `/start` and verify the redirect URL includes `?tp_session=...`
2. **Check cookie:** In browser DevTools → Application → Cookies, verify `tp_session` cookie exists
3. **Check webhook payload:** Verify the webhook includes `tp_session` in custom fields
4. **Check console:** Look for JavaScript errors on the GHL landing page
5. **Check selector:** Verify the JavaScript selector matches your GHL form field

### Token missing in webhook

- Verify the custom field is added to the GHL form
- Verify the JavaScript snippet is running and setting the field value
- Check webhook payload structure (may vary by GHL version)
- Check server logs for warnings about missing token

### Prefill data expires too quickly

- Default TTL is 60 minutes
- Ensure user completes landing page and visits `/intake` within 60 minutes
- Token cookie lasts 2 hours, but prefill data expires after 60 minutes

## Security Notes

- Token is stored in HttpOnly cookie (not accessible to JavaScript)
- Prefill data is stored server-side only (in-memory, not in database)
- Token is a random UUID (cryptographically secure)
- Prefill data expires after 60 minutes
- One-time read: data is deleted after first fetch

## Support

For issues or questions, check:
- Server logs for `[GHL]` and `[PREFILL]` prefixes
- Browser console for JavaScript errors
- Network tab for `/api/prefill` responses
