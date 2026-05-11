import { EventForm } from "@/components/EventForm";

export default function NewEventPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">새 채취 야장</h1>
      <p className="text-sm text-stone-500">현장에서 즉시 저장되며, 통신이 불안정하면 단말에 저장 후 자동 동기화됩니다.</p>
      <EventForm />
    </div>
  );
}
