import { JobRoleDetailClient } from "./JobRoleDetailClient";

export default async function JobRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JobRoleDetailClient jobDescriptionId={id} />;
}
