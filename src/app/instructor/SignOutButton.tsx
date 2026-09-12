"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      size="sm"
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/instructor/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
