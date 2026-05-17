import { NextResponse } from "next/server";
import { importBrokerCSV } from "@/features/vault/actions";

/**
 * POST — multipart/form-data with a `file` field (broker CSV).
 * Delegates parsing and upsert to the vault server action.
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const result = await importBrokerCSV(formData);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Import failed" },
      { status: 500 }
    );
  }
}
