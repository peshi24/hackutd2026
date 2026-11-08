import React, { useMemo } from "react";
import { View, Text, ScrollView } from "react-native";

type NeedType = "food" | "shelter" | "transport" | "medical";
type RequestItem = {
  id: number;
  name: string;
  urgency: number; // 1-5
  location: string;
  needs: Record<NeedType, number>;
};

type ResourceItem = {
  id: string;
  type: NeedType | "responder";
  available: number;
  label: string;
};

const requests: RequestItem[] = [
  { id: 1, name: "Maria", urgency: 5, location: "Northside", needs: { food: 2, shelter: 1, transport: 1, medical: 0 } },
  { id: 2, name: "Luis", urgency: 4, location: "River Park", needs: { food: 1, shelter: 2, transport: 0, medical: 0 } },
  { id: 3, name: "Ivy", urgency: 3, location: "West End", needs: { food: 1, shelter: 1, transport: 1, medical: 0 } },
  { id: 4, name: "David", urgency: 2, location: "Old Town", needs: { food: 2, shelter: 0, transport: 1, medical: 0 } },
];

const resources: ResourceItem[] = [
  { id: "r1", type: "food", available: 4, label: "Food Kits" },
  { id: "r2", type: "shelter", available: 3, label: "Shelter Beds" },
  { id: "r3", type: "transport", available: 2, label: "Transport Vans" },
  { id: "r4", type: "responder", available: 5, label: "Responders" },
];

function allocateRequests(
  activeRequests: RequestItem[],
  availableResources: ResourceItem[],
) {
  const sorted = [...activeRequests].sort((a, b) => b.urgency - a.urgency);

  const pool = Object.fromEntries(
    availableResources.map((r) => [r.type, r.available])
  );

  return sorted.map((req) => {
    const assigned: Record<string, number> = {};
    for (const [kind, qty] of Object.entries(req.needs)) {
      const type = kind as NeedType | "responder";
      if (qty <= 0) continue;
      const available = pool[type] ?? 0;
      const used = Math.min(qty, available);
      assigned[kind] = used;
      pool[type] = available - used;
    }
    return {
      ...req,
      assigned,
      status: Object.values(assigned).some((v) => v > 0) ? "dispatched" : "pending",
    };
  });
}

export default function DispatchDemoScreen() {
  const assignments = useMemo(
    () => allocateRequests(requests, resources),
    []
  );

  return (
    <ScrollView style={{ padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 16 }}>
        AI Dispatch Dashboard
      </Text>

      {assignments.map((item) => (
        <View
          key={item.id}
          style={{
            borderWidth: 1,
            borderRadius: 12,
            padding: 14,
            marginBottom: 12,
            backgroundColor: "#f8fafc",
          }}
        >
          <Text style={{ fontWeight: "700" }}>
            {item.name} • urgency {item.urgency}
          </Text>
          <Text>{item.location}</Text>
          <Text>Assigned: {JSON.stringify(item.assigned)}</Text>
          <Text>Status: {item.status}</Text>
        </View>
      ))}
    </ScrollView>
  );
}