export interface SearchCriteria {
  /** Local midnight of the chosen day. */
  day: Date;
  /** Minutes since local midnight. */
  startMinutes: number;
  endMinutes: number;
  participants: number;
}
