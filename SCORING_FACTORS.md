# Boyden Radar — Signal Scoring Factors

A comprehensive reference of all factors that can influence a company's risk/signal score.
Used for predicting leadership changes in Danish companies.

---

## Leadership & Management

- CEO tenure length (under 18 months = high risk)
- Number of CEO changes in 24 months
- Board size reduction (shrinking boards often precede M&A or distress)
- Multiple board members leaving within 90 days
- Replacement CEO has "interim" or operational profile vs. visionary
- New board members with PE/investor background (signals acquisition prep)
- Chairman change (often precedes full leadership overhaul)
- Executive team age (very young or very old leadership = higher transition risk)
- Founder still CEO vs. professional CEO (founder departure = major signal)
- Same person holding multiple roles (CEO + Chairman = concentration risk)

---

## Financial Health (from Virk annual reports)

- Negative equity (technically insolvent)
- Consecutive years of net losses (1, 2, 3+)
- Revenue declining YoY
- Gross margin compression over 3 years
- EBITDA turning negative
- Debt-to-assets ratio above 70% / 90%
- Late filing of annual accounts (legal deadline is 5 months after fiscal year end)
- Auditor issuing qualified opinion or disclaimer
- Auditor change (especially to smaller/lesser-known firm)
- Cash position declining sharply
- Accounts payable increasing faster than revenue (cash flow stress)
- Equity below legal minimum (anpartsselskaber need min. 40.000 DKK)
- Revenue growth vs. employee growth mismatch (growing headcount but flat revenue)
- Dividend payments stopping after years of paying

---

## Ownership & Structure

- New majority shareholder appearing
- Ownership moving from individual to holding company (often precedes sale)
- Private equity firm entering ownership
- Founder reducing ownership stake below 50%
- Cross-ownership with other companies increasing
- Company becoming subsidiary of a foreign entity
- Ownership structure becoming more complex (more layers = often acquisition prep)
- Share capital increase or decrease
- Change in company type (ApS → A/S often signals growth or IPO prep)

---

## Company Status & Registration

- Status changes (active → under winding up, etc.)
- Moving from active to tvangsopløsning (forced dissolution)
- Address changes (1 = normal, 2+ in 12 months = instability signal)
- Moving from prestigious address to cheaper area (or vice versa)
- Branch office openings or closures
- Change of fiscal year end (often signals restructuring)
- Company name change (rebranding often follows leadership or strategy shift)
- Splitting or merging with another entity

---

## Employees

- Headcount drop >10%, >25%, >50%
- Rapid headcount growth >20% (signals scaling, possible new leadership hire)
- Headcount growth without revenue growth (efficiency problem)
- Employee count going to zero (shutdown signal)
- LinkedIn employee count vs. Virk official count mismatch

---

## Industry & Market Context

- Industry-wide distress (peers also struggling)
- Industry consolidation wave happening (M&A activity in sector)
- Regulatory changes affecting the sector
- Company in declining industry with no pivot signals
- Seasonal business with off-season leadership changes

---

## Timing & Pattern Combinations

- Multiple signal types within 30/60/90 days
- Financial distress + leadership change at same time
- Ownership change + auditor change within 6 months
- CEO change + employee drop within 90 days
- Address change + board reduction + new shareholder (classic acquisition prep)
- Late accounts + auditor change + CEO change (classic distress pattern)
- Revenue peak followed by 2 years of decline + CEO change (turnaround hire)
- Board member added with specific background (e.g., restructuring specialist)

---

## Future Integrations (NewsAPI / LinkedIn)

- Negative press coverage about the company or CEO
- CEO mentioned in legal proceedings
- Company mentioned in bankruptcy/restructuring news
- LinkedIn: key executives updating profiles or going "open to work"
- LinkedIn: mass senior-level departures visible in hiring activity
- Job postings for senior roles (especially CEO, CFO, COO) = leadership gap signal
- Company posting many redundancy/farewell posts

---

## Notes

- ~60+ individual factors identified
- Most powerful signals are **combination patterns** firing within 90 days
- Single factors are weak predictors — 3+ signals together is where accuracy peaks
- AI (Claude) should be used to detect complex combinations that rules cannot catch
- Final score = rule-based signals + AI pattern recognition modifier

### AI Pattern Library (already implemented in company-ai-insight)

| Pattern | Name | Confidence | Outcome |
|---------|------|------------|---------|
| A | Forced Exit | High | New CEO within 3-6 months (78%) |
| B | Growth Hire | Medium | C-suite expansion within 6 months (65%) |
| C | Acquisition Prep | Medium | Company sold/merged within 12 months (61%) |
| D | Quiet Distress | High | Bankruptcy/restructuring within 18 months (71%) |
| E | Ownership Transition | Medium | Full leadership overhaul within 12 months (69%) |
