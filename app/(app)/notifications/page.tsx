import { NotificationList } from "@/features/notifications/components/NotificationList";

export default function NotificationsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-2xl">
          <h1 className="mb-4 text-xl font-semibold text-gray-900">お知らせ</h1>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <NotificationList />
          </div>
        </div>
      </div>
    </div>
  );
}
