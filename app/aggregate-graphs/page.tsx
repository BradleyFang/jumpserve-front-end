import { AggregateGraphsPanel } from "@/app/components/aggregate-graphs-panel";
import { fetchAggregateDelayGraphData } from "@/lib/emulated-runs-data";

export default async function AggregateGraphsPage() {
  const data = await fetchAggregateDelayGraphData();

  return <AggregateGraphsPanel data={data} />;
}
