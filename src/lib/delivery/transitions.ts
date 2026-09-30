// Shared by the courier UI and server. Terminal states have no next action.
export const DELIVERY_ACTIONS: Record<string, Array<[string, string]>> = {
  offered: [["accepted", "Accept assignment"], ["declined", "Decline"]],
  accepted: [["pickup_scheduled", "Pickup scheduled"]],
  pickup_scheduled: [["collected", "Collected from store"]],
  collected: [["out_for_delivery", "Out for delivery"], ["delivery_failed", "Report issue"]],
  out_for_delivery: [["delivered", "Mark delivered"], ["delivery_failed", "Delivery failed"]],
  delivery_failed: [["out_for_delivery", "Retry delivery"]],
};

export function canTransitionDelivery(current: string, next: string): boolean {
  return (DELIVERY_ACTIONS[current] ?? []).some(([status]) => status === next);
}
