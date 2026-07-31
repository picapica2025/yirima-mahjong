import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const mahjongRooms = sqliteTable("mahjong_rooms", {
  code: text("code").primaryKey(),
  stateJson: text("state_json").notNull(),
  revision: integer("revision").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
