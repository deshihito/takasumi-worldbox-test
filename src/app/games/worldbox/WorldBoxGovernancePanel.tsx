"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { WbIcon } from "./WbIcon";
import type {
  CityGovernanceState,
  CityPolicies,
  CourtTrial,
} from "@/lib/worldbox/social/governance";

const overlayStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(660px, calc(100vw - 24px))",
  maxHeight: "min(86svh, 710px)",
  overflowY: "auto",
  borderRadius: 14,
  padding: "0 16px 16px",
  background: "rgba(13, 19, 28, 0.96)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  boxShadow: "0 20px 50px rgba(0,0,0,0.65)",
  color: "#f1f5f9",
  zIndex: 26,
  fontSize: 13,
};

const stickyHeaderStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: "14px 0 10px",
  marginBottom: 10,
  background: "rgba(13, 19, 28, 0.98)",
  borderBottom: "1px solid rgba(148,163,184,0.22)",
};

const btn: CSSProperties = {
  minHeight: 32,
  padding: "5px 11px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(255,255,255,0.1)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

interface GovernanceApiResponse {
  selfKey: string;
  gov: CityGovernanceState;
  trials: CourtTrial[];
  selfIsMayor: boolean;
  selfVotedCandidate: string | null;
  stimulusCooldownMs: number;
  isLawyer: boolean;
  balance: number | null;
}

export default function WorldBoxGovernancePanel({
  jailed,
  onStatusChange,
  onClose,
}: {
  jailed: boolean;
  onStatusChange?: () => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<GovernanceApiResponse | null>(null);
  const [tab, setTab] = useState<"city" | "court">("city");
  const [manifesto, setManifesto] = useState("");
  const [policiesDraft, setPoliciesDraft] = useState<CityPolicies | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/worldbox/governance", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const d = (await res.json()) as GovernanceApiResponse;
      setData(d);
      setPoliciesDraft(d.gov.policies);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const callGov = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(`エラー: ${json.error ?? res.status}`);
        return;
      }
      await reload();
      if (onStatusChange) onStatusChange();
      setMsg(okMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wb-panel" style={overlayStyle} role="dialog" aria-label="市政庁・裁判所">
      <div style={stickyHeaderStyle}>
        <div>
          <strong style={{ fontSize: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <WbIcon name="gov" size={16} color="#fbbf24" /> タカスミ市政庁・公開法廷
          </strong>
          <div style={{ fontSize: 11, opacity: 0.78 }}>
            市長: {data?.gov.mayorName ?? "---"} ・ 市財源 ¥
            {(data?.gov.treasuryBalance ?? 0).toLocaleString()}
          </div>
        </div>
        <button type="button" style={btn} onClick={onClose}>
          閉じる
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setTab("city")}
          style={{
            ...btn,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            borderColor: tab === "city" ? "#38bdf8" : "rgba(148,163,184,0.3)",
          }}
        >
          <WbIcon name="vote" size={14} color="#38bdf8" /> 市長選挙・税制＆交付金
        </button>
        <button
          type="button"
          onClick={() => setTab("court")}
          style={{
            ...btn,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            borderColor: tab === "court" ? "#38bdf8" : "rgba(148,163,184,0.3)",
          }}
        >
          <WbIcon name="scale" size={14} color="#c084fc" /> 公開陪審員裁判 (
          {data?.trials.filter((t) => t.status === "open").length ?? 0})
        </button>
      </div>

      {msg && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(56,189,248,0.16)",
            border: "1px solid rgba(56,189,248,0.35)",
          }}
        >
          {msg}
        </div>
      )}

      {data && tab === "city" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(148,163,184,0.22)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div>
              <strong>現行市政ポリシー</strong>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>
                所得税 {(data.gov.policies.incomeTaxRate * 100).toFixed(0)}% ・ 自販機税{" "}
                {(data.gov.policies.vendingTaxRate * 100).toFixed(0)}% ・ 保釈倍率{" "}
                {data.gov.policies.bailMultiplier.toFixed(2)}x ・ 警察懸賞倍率{" "}
                {data.gov.policies.policeBountyMult.toFixed(2)}x
              </div>
            </div>
            <button
              type="button"
              disabled={busy || data.stimulusCooldownMs > 0}
              style={{ ...btn, background: "#16a34a" }}
              onClick={() =>
                callGov(
                  { action: "claim_stimulus" },
                  `市民給付金 ¥${data.gov.policies.stimulusPayout.toLocaleString()} を受給しました！`,
                )
              }
            >
              {data.stimulusCooldownMs > 0
                ? `給付済 (${Math.ceil(data.stimulusCooldownMs / 60000)}分待)`
                : `市民給付金を受給 ¥${data.gov.policies.stimulusPayout}`}
            </button>
          </div>

          {data.selfIsMayor && policiesDraft && (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.35)",
                display: "grid",
                gap: 8,
              }}
            >
              <strong style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <WbIcon name="crown" size={14} color="#fbbf24" /> 市長権限：政策パラメータ変更
              </strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  所得税率 (0.05〜0.20)
                  <input
                    type="number"
                    step={0.01}
                    value={policiesDraft.incomeTaxRate}
                    onChange={(e) =>
                      setPoliciesDraft({ ...policiesDraft, incomeTaxRate: Number(e.target.value) })
                    }
                    style={{
                      width: "100%",
                      marginTop: 2,
                      padding: 5,
                      background: "#0f172a",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  給付金額 (200〜2000)
                  <input
                    type="number"
                    step={50}
                    value={policiesDraft.stimulusPayout}
                    onChange={(e) =>
                      setPoliciesDraft({ ...policiesDraft, stimulusPayout: Number(e.target.value) })
                    }
                    style={{
                      width: "100%",
                      marginTop: 2,
                      padding: 5,
                      background: "#0f172a",
                      color: "#fff",
                    }}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={busy}
                style={{ ...btn, background: "#d97706" }}
                onClick={() =>
                  callGov(
                    { action: "update_policies", policies: policiesDraft },
                    "税制・政策を公布しました！",
                  )
                }
              >
                新ポリシーを公布する
              </button>
            </div>
          )}

          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(148,163,184,0.2)",
              display: "grid",
              gap: 8,
            }}
          >
            <strong>市長選挙候補者 ({Object.keys(data.gov.candidates).length})</strong>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                placeholder="公約マニフェスト (出馬供託金 ¥1,000)"
                value={manifesto}
                onChange={(e) => setManifesto(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.4)",
                  color: "#fff",
                  border: "1px solid rgba(148,163,184,0.3)",
                }}
              />
              <button
                type="button"
                disabled={busy}
                style={{ ...btn, background: "#0284c7" }}
                onClick={() =>
                  callGov({ action: "run_mayor", manifesto }, "市長選に出馬登録しました！")
                }
              >
                立候補する
              </button>
            </div>
            {Object.values(data.gov.candidates).map((cand) => (
              <div
                key={cand.ownerKey}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.04)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div>
                  <b>{cand.name}</b> — {cand.manifesto || "住みよいメトロ都市を築きます"}{" "}
                  <span style={{ color: "#38bdf8" }}>({cand.votes}票)</span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  style={{
                    ...btn,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    background:
                      data.selfVotedCandidate === cand.ownerKey
                        ? "#15803d"
                        : "rgba(255,255,255,0.1)",
                  }}
                  onClick={() =>
                    callGov(
                      { action: "vote_mayor", candidateKey: cand.ownerKey },
                      `${cand.name} に投票しました！`,
                    )
                  }
                >
                  {data.selfVotedCandidate === cand.ownerKey ? (
                    <>
                      投票済 <WbIcon name="check" size={12} color="#86efac" />
                    </>
                  ) : (
                    "投票"
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && tab === "court" && (
        <div style={{ display: "grid", gap: 10 }}>
          {jailed && (
            <button
              type="button"
              disabled={busy}
              style={{
                ...btn,
                background: "#7c3aed",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
              onClick={() =>
                callGov(
                  { action: "open_trial" },
                  "公開法廷を開廷しました！市民陪審員の投票を待ちます。",
                )
              }
            >
              <WbIcon name="scale" size={14} color="#f5f3ff" /> 公開陪審員裁判を開廷して控訴する
              (申請料 ¥300)
            </button>
          )}
          {data.trials.length === 0 && (
            <span style={{ opacity: 0.72 }}>現在開廷中・最近の裁判事案はありません。</span>
          )}
          {data.trials.map((t) => (
            <div
              key={t.id}
              style={{
                padding: 10,
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(148,163,184,0.22)",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>
                  被告人: {t.defendantName} ({t.chargeLabel})
                </strong>
                <span style={{ color: t.status === "open" ? "#facc15" : "#4ade80" }}>
                  {t.status === "open"
                    ? "審理中"
                    : t.status === "verdict_lenient"
                      ? "無罪・即時釈放"
                      : "有罪維持"}
                </span>
              </div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>
                弁護人: {t.lawyerName ?? "未選任"} ・ 陪審票: 寛大 {t.lenientVotes.length}
                {t.lawyerKey ? "(+1弁護士補正)" : ""} / 有罪 {t.guiltyVotes.length}
              </div>
              {t.status === "open" && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={busy}
                    style={{ ...btn, background: "#15803d" }}
                    onClick={() =>
                      callGov(
                        { action: "vote_jury", trialId: t.id, verdict: "lenient" },
                        "寛大(釈放)に投票しました",
                      )
                    }
                  >
                    無罪・減刑票
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    style={{ ...btn, background: "#991b1b" }}
                    onClick={() =>
                      callGov(
                        { action: "vote_jury", trialId: t.id, verdict: "guilty" },
                        "有罪に投票しました",
                      )
                    }
                  >
                    有罪維持票
                  </button>
                  {data.isLawyer && !t.lawyerKey && (
                    <button
                      type="button"
                      disabled={busy}
                      style={{ ...btn, background: "#0284c7" }}
                      onClick={() =>
                        callGov(
                          { action: "assign_lawyer", trialId: t.id },
                          "弁護人として着任しました",
                        )
                      }
                    >
                      弁護を引き受ける
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    style={btn}
                    onClick={() =>
                      callGov({ action: "resolve_trial", trialId: t.id }, "判決を確定しました！")
                    }
                  >
                    判決を確定
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
