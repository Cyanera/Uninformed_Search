import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSessionCode } from "@/lib/codes";
import { toPublicSession, type SessionRow } from "@/lib/types";
import { StudentActivity } from "./StudentActivity";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `Session ${normalizeSessionCode(code)}` };
}

export default async function StudentSessionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from("sessions")
    .select("*")
    .eq("code", normalizeSessionCode(code))
    .maybeSingle();

  if (!data) notFound();

  return <StudentActivity initialSession={toPublicSession(data as SessionRow)} serverNow={Date.now()} />;
}
