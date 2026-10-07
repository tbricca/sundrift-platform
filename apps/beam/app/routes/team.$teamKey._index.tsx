import { Navigate, useParams } from "react-router";

export default function TeamIndexRoute() {
  const { teamKey } = useParams();
  return <Navigate to={`/team/${teamKey}/issues`} replace />;
}
