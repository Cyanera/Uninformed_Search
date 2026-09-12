"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveSession } from "@/components/useLiveSession";
import { useLiveRoster } from "@/components/useLiveRoster";
import { Badge, Tabs } from "@/components/ui";
import { buildClassStats, buildResults } from "@/lib/analysis";
import type { ParticipantRow, PublicSession, SubmissionRow } from "@/lib/types";
import { ControlBar } from "./ControlBar";
import { LiveTable } from "./LiveTable";
import { StudentDetail } from "./StudentDetail";
import { Analytics } from "./Analytics";
import { TeachMode } from "./TeachMode";
import { SettingsPanel } from "./SettingsPanel";

type TabId = "live" | "analytics" | "teach" | "settings";

export function Dashboard({
  initialSession,
  serverNow,
  initialParticipants,
  initialSubmissions,
}: {
  initialSession: PublicSession;
  serverNow: number;
  initialParticipants: ParticipantRow[];
  initialSubmissions: SubmissionRow[];
}) {
  const { session, timer } = useLiveSession(initialSession, serverNow);
  const { participants, submissions, connected } = useLiveRoster(
    session.id,
    initialParticipants,
    initialSubmissions,
  );

  const [tab, setTab] = useState<TabId>("live");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [projector, setProjector] = useState(false);

  const results = useMemo(
    () => buildResults(session, participants, submissions),
    [session, participants, submissions],
  );
  const stats = useMemo(() => buildClassStats(session, results), [session, results]);
  const selected = results.find((r) => r.participant.id === selectedStudent) ?? null;

  // Projector mode strips the dashboard down to the demonstration itself.
  if (projector && tab === "teach") {
    return <TeachMode session={session} projector onExitProjector={() => setProjector(false)} />;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/instructor" className="text-sm text-accent underline-offset-2 hover:underline">
          &larr; All sessions
        </Link>
        <Badge tone={connected ? "goal" : "warn"}>
          {connected ? "Live" : "Reconnecting…"}
        </Badge>
      </div>

      <ControlBar
        session={session}
        timer={timer}
        studentCount={participants.length}
        submittedCount={results.filter((r) => r.finalSubmittedAt).length}
      />

      <div className="mt-6">
        <Tabs
          ariaLabel="Dashboard sections"
          active={tab}
          onChange={(id) => {
            setTab(id);
            setSelectedStudent(null);
          }}
          tabs={[
            { id: "live", label: "Live" },
            { id: "analytics", label: "Analytics" },
            { id: "teach", label: "Teach Mode" },
            { id: "settings", label: "Settings" },
          ]}
        />
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-5">
        {tab === "live" &&
          (selected ? (
            <StudentDetail
              session={session}
              result={selected}
              submissions={submissions}
              onBack={() => setSelectedStudent(null)}
            />
          ) : (
            <LiveTable
              session={session}
              results={results}
              onSelect={(id) => setSelectedStudent(id)}
            />
          ))}

        {tab === "analytics" &&
          (selected ? (
            <StudentDetail
              session={session}
              result={selected}
              submissions={submissions}
              onBack={() => setSelectedStudent(null)}
            />
          ) : (
            <Analytics
              session={session}
              results={results}
              stats={stats}
              onSelect={(id) => setSelectedStudent(id)}
            />
          ))}

        {tab === "teach" && (
          <TeachMode session={session} onEnterProjector={() => setProjector(true)} />
        )}

        {tab === "settings" && <SettingsPanel session={session} />}
      </div>
    </main>
  );
}
