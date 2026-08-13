/**
 * What one generation run did, as the endpoint reports it.
 *
 * A summary rather than the rows themselves, and that is the decision this file
 * exists to record. A January run touches every employee × every leave type;
 * returning the balances would be a payload nobody reads, in place of the four
 * numbers somebody actually checks before closing the tab. The rows are already
 * addressable — `GET /employee-leave-balances?year=2027` lists exactly what was
 * written — so publishing them here would be a second way to ask one question.
 *
 * Every count is of *balances*, never of employees: one person contributes as
 * many entries as there are leave types in scope, and a reader who assumed
 * otherwise would think the company had quadrupled.
 */
export class LeaveBalanceGenerationReport {
  /** The year that was opened — the `year` from the request, echoed once. */
  year!: number;

  /**
   * Balances written. `0` on a `dryRun`, and `0` on a re-run that found
   * everything already in place — which are different situations that
   * {@link dryRun} and {@link skipped} tell apart.
   */
  created!: number;

  /**
   * Balances left alone because the employee already held one for this type and
   * year.
   *
   * The number that makes the endpoint re-runnable in practice: HR runs it in
   * December, three people are hired in January, and the second run reports the
   * first run's rows here rather than failing on them.
   */
  skipped!: number;

  /**
   * Days written off across the previous year's balances by the carry-over
   * policy.
   *
   * Reported because it is the only destructive thing a run does. A number far
   * larger than expected is how somebody notices that a leave type is missing
   * its `allowsCarryOver` flag — before the employees do.
   */
  expiredFromPreviousYear!: number;

  /** Balances whose previous year was capped; the rows behind the count above. */
  expiredBalances!: number;

  /**
   * Whether this was a preview. `true` means nothing above was written.
   *
   * Echoed rather than left implicit so a report saved, pasted or logged still
   * says what it was — the counts alone cannot distinguish a preview from a run.
   */
  dryRun!: boolean;

  /**
   * Everything the run could not do, in words, each naming the thing it is about
   * by the name a person chose it by.
   *
   * Warnings rather than errors, and the distinction is the feature's central
   * bet: one leave type without a `defaultAllocatedDays` must not cost the other
   * three their run, and one stale id in a list of two hundred must not cost the
   * hundred and ninety-nine. Everything that *can* be done is done, and what
   * could not is stated.
   *
   * The list is capped by what can go wrong — a warning per leave type and per
   * unknown id — not by the number of employees, so it cannot grow with the
   * company.
   */
  warnings!: string[];
}
