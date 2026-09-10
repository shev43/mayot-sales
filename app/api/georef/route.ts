import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Dev-only: зберігає результат /calibrate у data/georef.json (+ envelope)
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("georef save is dev-only", { status: 403 });
  }
  const body = (await req.json()) as { local_to_crs?: unknown; envelope?: unknown };
  const file = path.join(process.cwd(), "data", "georef.json");
  const cur = JSON.parse(await fs.readFile(file, "utf8"));
  const next = { ...cur, local_to_crs: { ...(cur.local_to_crs ?? {}), ...(body.local_to_crs as object) }, envelope: body.envelope ?? cur.envelope };
  await fs.writeFile(file, JSON.stringify(next, null, 1));
  return NextResponse.json({ ok: true });
}
