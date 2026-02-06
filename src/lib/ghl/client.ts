import "server-only";

type Json = Record<string, any>;

export type GhlClientConfig = {
  apiKey: string; // Private Integration Token (PIT) or sub-account token
  locationId: string;
  baseUrl?: string; // default https://services.leadconnectorhq.com
  version?: string; // default 2021-07-28
};

export type UpsertContactInput = {
  email: string;
  firstName?: string;
  phone?: string;
};

export class GhlApiError extends Error {
  status: number;
  bodyText?: string;

  constructor(message: string, status: number, bodyText?: string) {
    super(message);
    this.name = "GhlApiError";
    this.status = status;
    if (bodyText !== undefined) {
      this.bodyText = bodyText;
    }
  }
}

export class GhlClient {
  private apiKey: string;
  private locationId: string;
  private baseUrl: string;
  private version: string;

  constructor(cfg: GhlClientConfig) {
    this.apiKey = cfg.apiKey;
    this.locationId = cfg.locationId;
    this.baseUrl = (cfg.baseUrl ?? "https://services.leadconnectorhq.com").replace(/\/+$/, "");
    this.version = cfg.version ?? "2021-07-28";
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const url =
      path.startsWith("http://") || path.startsWith("https://")
        ? path
        : `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Version: this.version,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(extraHeaders ?? {}),
    };

    const init: RequestInit = {
      method,
      headers,
      cache: "no-store",
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GhlApiError(`GHL ${method} ${path} failed`, res.status, text);
    }

    const text = await res.text().catch(() => "");
    if (!text) return {} as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      return { raw: text } as unknown as T;
    }
  }

  // ---------------------------------------------------------------------------
  // Contacts
  // ---------------------------------------------------------------------------

  async upsertContact(input: UpsertContactInput): Promise<Json> {
    const payload: Json = {
      locationId: this.locationId,
      email: input.email,
    };
    if (input.firstName) payload.firstName = input.firstName;
    if (input.phone) payload.phone = input.phone;

    return this.request<Json>(
      "POST",
      "https://services.leadconnectorhq.com/contacts/upsert",
      payload
    );
  }

  async getContact(contactId: string): Promise<Json> {
    return this.request<Json>(
      "GET",
      `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}`
    );
  }

  /**
   * Search contacts by custom field value.
   * Returns contacts where the specified custom field matches the value.
   */
  async searchContactsByCustomField(fieldKey: string, fieldValue: string): Promise<Json> {
    // GHL search API: POST to /contacts/search with query filter
    const payload: Json = {
      locationId: this.locationId,
      query: {
        customFields: {
          [fieldKey]: fieldValue,
        },
      },
      limit: 10, // Only need one match, but allow a few for safety
    };

    return this.request<Json>(
      "POST",
      "https://services.leadconnectorhq.com/contacts/search",
      payload
    );
  }

  async addTags(contactId: string, tags: string[]): Promise<Json> {
    return this.request<Json>(
      "POST",
      `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/tags`,
      { tags }
    );
  }

  async createNote(contactId: string, body: string, userId?: string): Promise<Json> {
    const payload: Json = { body };
    if (userId) payload.userId = userId;

    return this.request<Json>(
      "POST",
      `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/notes`,
      payload
    );
  }

  // ---------------------------------------------------------------------------
  // Email via Conversations
  // ---------------------------------------------------------------------------

  /**
   * Send an email via Conversations Messages API.
   *
   * Sends HTML in the `html` field (rendered as HTML in inbox clients) and plain text in `message`
   * (required by GHL; used as fallback). When `text` is provided, it is used for `message`;
   * otherwise plain text is derived by stripping HTML.
   * Critical details (learned empirically):
   * - GHL requires a non-empty plain-text `message`
   * - HTML alone is NOT sufficient
   * - locationId must be present
   */
  async sendEmailToContact(opts: {
    contactId: string;
    subject: string;
    html: string;
    /** Optional plain-text body; when set, used for `message` instead of stripping HTML */
    text?: string;
  }): Promise<Json> {
    const plainBody =
      typeof opts.text === "string" && opts.text.trim().length > 0
        ? opts.text.trim()
        : stripHtml(opts.html);

    const payload: Json = {
      locationId: this.locationId,
      contactId: opts.contactId,

      type: "Email",
      channel: "Email",
      source: "API",

      subject: opts.subject,

      message: plainBody,
      html: opts.html,
    };

    return this.request<Json>(
      "POST",
      "https://services.leadconnectorhq.com/conversations/messages",
      payload
    );
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/?[^>]+(>|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractContactIdFromUpsertResponse(resp: Json): string | null {
  const candidates = [
    resp?.contact?.id,
    resp?.contact?.contactId,
    resp?.contactId,
    resp?.id,
    resp?._id,
    resp?.contact?._id,
  ].filter((v) => typeof v === "string" && v.length > 0) as string[];

  return candidates[0] ?? null;
}

export function extractTagsFromGetContactResponse(resp: Json): string[] {
  const tags = resp?.contact?.tags ?? resp?.tags;
  if (Array.isArray(tags)) {
    return tags.filter((t) => typeof t === "string");
  }
  return [];
}
