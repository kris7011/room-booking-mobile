/** A meeting time on one local day. */
export interface SearchWindow {
  /** Local midnight of the chosen day. */
  day: Date;
  /** Minutes since local midnight. */
  startMinutes: number;
  endMinutes: number;
}

export interface SearchCriteria extends SearchWindow {
  participants: number;
}
