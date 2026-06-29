import { redirect } from "next/navigation";

type CallsRedirectPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CallsRedirectPage({ searchParams }: CallsRedirectPageProps) {
  redirect(`/conversations${formatSearchSuffix(await searchParams)}`);
}

function formatSearchSuffix(params: Record<string, string | string[] | undefined> | undefined) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item));
    } else if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}
