import { redirect } from "next/navigation";

export default async function LegacyVerifyRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/job-descriptions/${id}`);
}
