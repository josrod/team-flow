// Centralised HTML sanitizer for any rich text we receive from external
// systems (Azure DevOps work-item description / repro steps, etc.).
//
// Azure DevOps lets any tenant user paste arbitrary HTML into work items —
// including `<img src=x onerror=...>` and `<script>`. Rendering that with
// dangerouslySetInnerHTML would be a stored XSS into this app, giving the
// payload full access to localStorage (Supabase session) and any in-memory
// secret. We allowlist the small subset of tags ADO actually uses for rich
// text and strip everything else, including event handlers and javascript:
// URLs.

import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "span",
  "div",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
];

const ALLOWED_ATTR = ["href", "title", "alt", "src", "target", "rel"];

export const sanitizeRichText = (html: string): string => {
  if (typeof html !== "string" || html.length === 0) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#)/i,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "style"],
  });
};
