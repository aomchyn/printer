export function getSignatureStoragePath(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  const clean = value.trim();
  if (!clean) return null;

  const markers = [
    "/storage/v1/object/public/signatures/",
    "/storage/v1/object/sign/signatures/",
  ];

  for (const marker of markers) {
    const index = clean.indexOf(marker);

    if (index >= 0) {
      const path = clean
        .slice(index + marker.length)
        .split("?")[0];

      return decodeURIComponent(path);
    }
  }

  return clean.replace(/^\/+/, "");
}