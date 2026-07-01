// Pure validator for a document upload. Depends only on {size, name, type} of the file, so it is unit-testable
// without a real File. The server action passes the real File (which satisfies FileLike) and uploads it to Vapi.
type FormLike = { get(name: string): unknown };
type FileLike = { size: number; name: string; type?: string };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export const DOCUMENT_KINDS = ["general", "price_list"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const ALLOWED_DOC_EXTENSIONS = ["pdf", "docx", "doc", "txt", "csv", "md"] as const;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5 MB
const NAME_MAX = 40; // Vapi file-name limit

const parseKind = (v: unknown): DocumentKind =>
  typeof v === "string" && (DOCUMENT_KINDS as readonly string[]).includes(v) ? (v as DocumentKind) : "general";

const extOf = (filename: string): string => {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
};

export type DocumentValues = { name: string; kind: DocumentKind };

export function parseDocumentForm(
  form: FormLike
): { error?: string; values: DocumentValues | null; file: FileLike | null } {
  const file = form.get("file") as FileLike | null;
  if (!file || typeof file.size !== "number" || typeof file.name !== "string" || file.size === 0)
    return { error: "document_file_required", values: null, file: null };
  if (file.size > MAX_DOCUMENT_BYTES) return { error: "document_too_large", values: null, file: null };
  if (!(ALLOWED_DOC_EXTENSIONS as readonly string[]).includes(extOf(file.name)))
    return { error: "document_type_unsupported", values: null, file: null };

  const name = text(form.get("name")) ?? file.name;
  if (name.length > NAME_MAX) return { error: "document_name_too_long", values: null, file: null };

  return { error: undefined, values: { name, kind: parseKind(form.get("kind")) }, file };
}
