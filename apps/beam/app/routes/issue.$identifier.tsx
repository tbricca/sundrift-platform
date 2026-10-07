import { useParams } from "react-router";

import { IssueDetail } from "@/components/issues/IssueDetail";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Issue — ${APP_TITLE}` }];
}

export default function IssueDetailRoute() {
  const { identifier = "" } = useParams();
  return <IssueDetail identifier={identifier} variant="page" />;
}
