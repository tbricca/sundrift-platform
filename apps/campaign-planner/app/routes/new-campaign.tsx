import { IconArrowRight } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function meta() {
  return [
    { title: "Campaign Planner - New campaign" },
    {
      name: "description",
      content: "Create a campaign from a name and description.",
    },
  ];
}

export default function NewCampaignRoute() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [description, setDescription] = useState("");
  const ready = name.trim() && keywords.trim() && description.trim();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Campaign</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Give the campaign a name and description. The workspace will attach the
          closest Sundrift product and open the financial model.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign settings</CardTitle>
          <CardDescription>Add the details needed to start building.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!ready) return;
              navigate("/campaign/build", {
                state: {
                  name: name.trim(),
                  campaignKeywords: keywords.trim(),
                  description: description.trim(),
                },
              });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaign-name">Campaign name</Label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Midwest Weekender layering"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaign-keywords">Campaign keywords</Label>
              <Input
                id="campaign-keywords"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder="e.g. weekender bag, packing cubes"
                aria-describedby="campaign-keywords-description"
              />
              <p id="campaign-keywords-description" className="text-muted-foreground text-xs">
                Product terms the financial model should use.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaign-description">Description</Label>
              <textarea
                id="campaign-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="e.g. Soft duffel story for a long weekend in the Midwest"
                rows={5}
                className="border-input bg-background min-h-32 w-full resize-y rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" className="self-start" disabled={!ready}>
              Build Campaign
              <IconArrowRight className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
