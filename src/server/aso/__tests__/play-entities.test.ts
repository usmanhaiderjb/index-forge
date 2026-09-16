import { describe, expect, it } from "vitest";

import { decodeEntities } from "@/server/aso/builtin/play";

/**
 * Titles and developer names arrive HTML-escaped.
 *
 * Decoding once lived inside the description-only `stripTags`, so every app
 * name kept its entities: "AllTrails: Hike, Bike &amp; Run" was stored that way
 * and rendered that way on screen.
 */
describe("decodeEntities", () => {
  it("decodes the entities Play emits in names", () => {
    expect(decodeEntities("Hike, Bike &amp; Run")).toBe("Hike, Bike & Run");
    expect(decodeEntities("Samsung &quot;Health&quot;")).toBe('Samsung "Health"');
    expect(decodeEntities("Todoist&#39;s planner")).toBe("Todoist's planner");
    expect(decodeEntities("a&nbsp;b")).toBe("a b");
  });

  it("leaves text without entities untouched", () => {
    expect(decodeEntities("Strava: Run, Bike, Walk")).toBe("Strava: Run, Bike, Walk");
  });
});
