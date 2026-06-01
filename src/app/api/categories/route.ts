import { NextResponse } from "next/server";
import { getCategories, DEFAULT_CATEGORY } from "@/lib/categories";

export async function GET() {
  return NextResponse.json({ categories: getCategories(), default: DEFAULT_CATEGORY });
}
