"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import PulseDashboard from "@/app/components/dashboard/PulseDashboard";

const LandingPage = dynamic(() => import("@/app/components/landing/LandingPage"), { ssr: false });

export default function Page() {
  const [landingFading, setLandingFading] = useState(false);
  const [mountDashboard, setMountDashboard] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  function handleEnter() {
    // Mount dashboard now so its data fetches start during the 600ms fade
    setMountDashboard(true);
    setLandingFading(true);
    setTimeout(() => setShowDashboard(true), 600);
  }

  return (
    <div style={{ position: "relative", width: "100%", minHeight: "100vh" }}>
      {/* Landing — visible until fade completes */}
      {!showDashboard && (
        <div
          className={`landing-page${landingFading ? " fade-out" : ""}`}
          style={{ position: "absolute", inset: 0, zIndex: 10 }}
        >
          <LandingPage onEnter={handleEnter} />
        </div>
      )}

      {/* Dashboard — only mounted once transition starts */}
      {mountDashboard && (
        <div
          className={`dashboard${showDashboard ? " fade-in" : ""}`}
          style={{ position: "absolute", inset: 0, zIndex: 1 }}
        >
          <PulseDashboard />
        </div>
      )}
    </div>
  );
}
