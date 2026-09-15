"use client";

import { useState } from "react";
import { Button, Card, cx } from "@/components/ui";
import {
  DEFAULT_TOTAL_MARKS,
  formatMarks,
  gradeStudent,
  marksFilename,
  resultsToCsv,
  resultsToRows,
} from "@/lib/grading";
import type { StudentResult } from "@/lib/analysis";
import type { PublicSession } from "@/lib/types";

/**
 * The marks sheet.
 *
 * Every enabled strategy is worth the same, and within a strategy a student
 * earns credit for each position of the expansion order they placed correctly,
 * so a long correct prefix with one late slip is not scored as a total loss.
 */
export function Marks({
  session,
  results,
  onSelect,
}: {
  session: PublicSession;
  results: StudentResult[];
  onSelect: (participantId: string) => void;
}) {
  const [total, setTotal] = useState(DEFAULT_TOTAL_MARKS);

  const graded = results
    .map((result) => ({ result, grade: gradeStudent(result, total) }))
    .sort((a, b) => b.grade.marks - a.grade.marks || a.result.participant.name.localeCompare(b.result.participant.name));

  function save(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadExcel() {
    // Loaded on demand: no reason to carry a zip encoder on every page view.
    const { buildXlsx } = await import("@/lib/xlsx");
    const rows = resultsToRows(results, session.strategies, total);
    const bytes = buildXlsx(rows, `Marks ${session.code}`);
    save(
      new Blob([new Uint8Array(bytes)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      marksFilename(session.code, "xlsx"),
    );
  }

  function downloadCsv() {
    const csv = resultsToCsv(results, session.strategies, total);
    // A BOM so Excel opens Arabic names correctly if the CSV is used instead.
    save(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }), marksFilename(session.code, "csv"));
  }

  if (!results.length) {
    return (
      <Card title="Marks">
        <p className="text-sm text-ink-muted">Marks appear once students have submitted.</p>
      </Card>
    );
  }

  const mean = graded.reduce((n, g) => n + g.grade.marks, 0) / graded.length;

  return (
    <Card
      title="Marks"
      description={`Each of the ${session.strategies.length} strategies is worth the same. Partial credit is given per correct position.`}
      actions={
        <span className="flex flex-wrap items-center gap-2 no-print">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-muted">Out of</span>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={total}
              onChange={(e) => setTotal(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 w-20 rounded border border-line-strong bg-paper px-2 text-sm"
            />
          </label>
          <Button size="sm" variant="primary" onClick={downloadExcel}>
            Download Excel
          </Button>
          <Button size="sm" onClick={downloadCsv}>
            CSV
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            Print
          </Button>
        </span>
      }
    >
      <p className="mb-3 text-sm text-ink-muted">
        Class average: <strong className="tabular text-ink">{formatMarks(Math.round(mean * 4) / 4)}</strong> out
        of {total}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left">
              <th scope="col" className="px-3 py-2 font-semibold">Student</th>
              <th scope="col" className="px-3 py-2 font-semibold">ID</th>
              {session.strategies.map((s) => (
                <th key={s} scope="col" className="px-2 py-2 text-center font-semibold">{s}</th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-semibold">Mark</th>
            </tr>
          </thead>
          <tbody>
            {graded.map(({ result, grade }) => (
              <tr
                key={result.participant.id}
                onClick={() => onSelect(result.participant.id)}
                className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas"
              >
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {result.participant.name}
                  {result.isLate && <span className="ml-2 text-xs font-medium text-warn">LATE</span>}
                  {!result.finalSubmittedAt && (
                    <span className="ml-2 text-xs text-ink-faint">did not finish</span>
                  )}
                </th>
                <td className="px-3 py-2 font-mono text-ink-muted">{result.participant.student_number}</td>

                {session.strategies.map((strategy) => {
                  const mark = grade.perStrategy.find((m) => m.strategy === strategy);
                  return (
                    <td key={strategy} className="px-2 py-2 text-center tabular">
                      {mark && mark.answered ? (
                        <span className={cx(mark.exact ? "font-semibold text-goal" : "text-ink")}>
                          {formatMarks(Math.round(mark.marks * 4) / 4)}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                  );
                })}

                <td className="px-3 py-2 text-right">
                  <span className="tabular text-lg font-semibold">{formatMarks(grade.marks)}</span>
                  <span className="text-ink-muted"> / {total}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">
        A strategy in bold green was answered with the exact expansion order. Click any row to see that
        student&rsquo;s sequences against the correct ones.
      </p>
    </Card>
  );
}
