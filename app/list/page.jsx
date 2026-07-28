"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SmartTroliApp from "../components/SmartTroliApp";

function ListPageInner() {
  const searchParams = useSearchParams();
  const itemsParam = searchParams.get("items") || "";
  const initialItems = itemsParam
    .split(",")
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean)
    .slice(0, 20);

  return <SmartTroliApp initialItems={initialItems} autoRunSearch={initialItems.length > 0} />;
}

export default function ListPage() {
  return (
    <Suspense fallback={null}>
      <ListPageInner />
    </Suspense>
  );
}
