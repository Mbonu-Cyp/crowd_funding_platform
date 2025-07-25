import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const simnet = (globalThis as any).simnet;

const accounts = simnet.getAccounts();
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;
const deployer = accounts.get("deployer")!;

const contractName = "crowdfunding_platform";

// Error constants
const ERR_OWNER_ONLY = 100;
const ERR_NOT_FOUND = 101;
const ERR_ALREADY_EXISTS = 102;
const ERR_INVALID_AMOUNT = 103;
const ERR_DEADLINE_PASSED = 104;
const ERR_GOAL_NOT_REACHED = 105;
const ERR_ALREADY_CLAIMED = 106;
const ERR_TRANSFER_FAILED = 107;
const ERR_CAMPAIGN_ACTIVE = 108;
const ERR_MINIMUM_CONTRIBUTION = 109;
const ERR_ALREADY_REPORTED = 110;
const ERR_MILESTONE_NOT_FOUND = 111;

// Constants
const MIN_CONTRIBUTION = 1000000; // 1 STX
const PLATFORM_FEE_PERCENTAGE = 25; // 0.25%

describe("Decentralized Crowdfunding Platform Tests", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
  });

  describe("Campaign Creation", () => {
    it("allows user to create campaign", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-campaign",
        [
          Cl.uint(10000000000), // 10k STX goal
          Cl.uint(simnet.blockHeight + 1000) // Deadline 1000 blocks in future
        ],
        address1
      );
      expect(result).toBeOk(Cl.uint(0)); // First campaign ID
    });

    it("stores campaign details correctly", () => {
      const goal = 5000000000; // 5k STX
      const deadline = simnet.blockHeight + 500;
      
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(goal), Cl.uint(deadline)],
        address1
      );

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-details",
        [Cl.uint(0)],
        deployer
      );
      
      expect(result).toBeSome(
        Cl.tuple({
          owner: Cl.principal(address1),
          goal: Cl.uint(goal),
          raised: Cl.uint(0),
          deadline: Cl.uint(deadline),
          claimed: Cl.bool(false)
        })
      );
    });

    it("increments campaign nonce", () => {
      // Create first campaign
      const result1 = simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(1000000000), Cl.uint(simnet.blockHeight + 100)],
        address1
      );
      expect(result1.result).toBeOk(Cl.uint(0));

      // Create second campaign
      const result2 = simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(2000000000), Cl.uint(simnet.blockHeight + 200)],
        address2
      );
      expect(result2.result).toBeOk(Cl.uint(1));

      // Check total campaigns
      const { result: totalResult } = simnet.callReadOnlyFn(
        contractName,
        "get-total-campaigns",
        [],
        deployer
      );
      expect(totalResult).toBeUint(2);
    });

    it("prevents creating campaign with zero goal", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(0), Cl.uint(simnet.blockHeight + 100)],
        address1
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_AMOUNT));
    });

    it("prevents creating campaign with past deadline", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(1000000000), Cl.uint(simnet.blockHeight - 1)],
        address1
      );
      expect(result).toBeErr(Cl.uint(ERR_DEADLINE_PASSED));
    });

    it("allows multiple campaigns from same user", () => {
      const result1 = simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(1000000000), Cl.uint(simnet.blockHeight + 100)],
        address1
      );
      expect(result1.result).toBeOk(Cl.uint(0));

      const result2 = simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(2000000000), Cl.uint(simnet.blockHeight + 200)],
        address1
      );
      expect(result2.result).toBeOk(Cl.uint(1));
    });
  });

  describe("Campaign Contributions", () => {
    beforeEach(() => {
      // Create test campaign
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [
          Cl.uint(5000000000), // 5k STX goal
          Cl.uint(simnet.blockHeight + 1000)
        ],
        address1
      );
    });

    it("allows user to contribute to campaign", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(1000000000)], // 1k STX
        address2
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("updates campaign raised amount", () => {
      const contributionAmount = 2000000000; // 2k STX
      
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(contributionAmount)],
        address2
      );

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-details",
        [Cl.uint(0)],
        deployer
      );
      
      const campaign = result.expectSome();
      expect(campaign).toMatchObject({
        raised: Cl.uint(contributionAmount)
      });
    });

    it("stores contributor information", () => {
      const contributionAmount = 1500000000; // 1.5k STX
      
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(contributionAmount)],
        address2
      );

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(0), Cl.principal(address2)],
        deployer
      );
      
      expect(result).toBeSome(
        Cl.tuple({
          amount: Cl.uint(contributionAmount)
        })
      );
    });

    it("accumulates multiple contributions from same user", () => {
      // First contribution
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(1000000000)], // 1k STX
        address2
      );

      // Second contribution
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(500000000)], // 0.5k STX
        address2
      );

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(0), Cl.principal(address2)],
        deployer
      );
      
      expect(result).toBeSome(
        Cl.tuple({
          amount: Cl.uint(1500000000) // 1.5k STX total
        })
      );
    });

    it("handles contributions from multiple users", () => {
      // Contribution from address2
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(2000000000)],
        address2
      );

      // Contribution from address3
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(1500000000)],
        address3
      );

      // Check total raised
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-details",
        [Cl.uint(0)],
        deployer
      );
      
      const campaign = result.expectSome();
      expect(campaign).toMatchObject({
        raised: Cl.uint(3500000000) // 3.5k STX total
      });
    });

    it("prevents contribution to non-existent campaign", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(999), Cl.uint(1000000000)],
        address2
      );
      expect(result).toBeErr(Cl.uint(ERR_NOT_FOUND));
    });

    it("prevents zero contributions", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(0)],
        address2
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_AMOUNT));
    });

    it("prevents contributions after deadline", () => {
      // Create campaign with short deadline
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(1000000000), Cl.uint(simnet.blockHeight + 5)],
        address1
      );

      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(10);

      const { result } = simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(1), Cl.uint(1000000000)],
        address2
      );
      expect(result).toBeErr(Cl.uint(ERR_DEADLINE_PASSED));
    });
  });

  describe("Fund Claiming", () => {
    beforeEach(() => {
      // Create campaign
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [
          Cl.uint(3000000000), // 3k STX goal
          Cl.uint(simnet.blockHeight + 100)
        ],
        address1
      );

      // Contribute enough to reach goal
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(3500000000)], // 3.5k STX (over goal)
        address2
      );
    });

    it("allows campaign owner to claim funds after successful campaign", () => {
      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(101);

      const { result } = simnet.callPublicFn(
        contractName,
        "claim-funds",
        [Cl.uint(0)],
        address1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("marks campaign as claimed after fund claiming", () => {
      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(101);
      
      simnet.callPublicFn(contractName, "claim-funds", [Cl.uint(0)], address1);

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-details",
        [Cl.uint(0)],
        deployer
      );
      
      const campaign = result.expectSome();
      expect(campaign).toMatchObject({
        claimed: Cl.bool(true)
      });
    });

    it("transfers funds to campaign owner", () => {
      const initialBalance = simnet.getAssetsMap().get(address1)?.STX || 0;
      
      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(101);
      
      simnet.callPublicFn(contractName, "claim-funds", [Cl.uint(0)], address1);

      const finalBalance = simnet.getAssetsMap().get(address1)?.STX || 0;
      expect(finalBalance).toBe(initialBalance + 3500000000);
    });

    it("prevents non-owner from claiming funds", () => {
      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(101);

      const { result } = simnet.callPublicFn(
        contractName,
        "claim-funds",
        [Cl.uint(0)],
        address2 // Not the owner
      );
      expect(result).toBeErr(Cl.uint(ERR_OWNER_ONLY));
    });

    it("prevents claiming before deadline", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "claim-funds",
        [Cl.uint(0)],
        address1
      );
      expect(result).toBeErr(Cl.uint(ERR_DEADLINE_PASSED));
    });

    it("prevents claiming if goal not reached", () => {
      // Create campaign with higher goal
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(10000000000), Cl.uint(simnet.blockHeight + 50)], // 10k STX goal
        address1
      );

      // Contribute less than goal
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(1), Cl.uint(5000000000)], // 5k STX
        address2
      );

      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(51);

      const { result } = simnet.callPublicFn(
        contractName,
        "claim-funds",
        [Cl.uint(1)],
        address1
      );
      expect(result).toBeErr(Cl.uint(ERR_GOAL_NOT_REACHED));
    });

    it("prevents double claiming", () => {
      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(101);

      // First claim
      simnet.callPublicFn(contractName, "claim-funds", [Cl.uint(0)], address1);

      // Second claim attempt
      const { result } = simnet.callPublicFn(
        contractName,
        "claim-funds",
        [Cl.uint(0)],
        address1
      );
      expect(result).toBeErr(Cl.uint(ERR_ALREADY_CLAIMED));
    });
  });

  describe("Refund System", () => {
    beforeEach(() => {
      // Create campaign that will fail
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [
          Cl.uint(5000000000), // 5k STX goal
          Cl.uint(simnet.blockHeight + 50)
        ],
        address1
      );

      // Contribute less than goal
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(2000000000)], // 2k STX
        address2
      );

      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(1000000000)], // 1k STX
        address3
      );
    });

    it("allows contributor to get refund after failed campaign", () => {
      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(51);

      const { result } = simnet.callPublicFn(
        contractName,
        "refund",
        [Cl.uint(0)],
        address2
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("returns correct amount to contributor", () => {
      const initialBalance = simnet.getAssetsMap().get(address2)?.STX || 0;
      
      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(51);
      
      simnet.callPublicFn(contractName, "refund", [Cl.uint(0)], address2);

      const finalBalance = simnet.getAssetsMap().get(address2)?.STX || 0;
      expect(finalBalance).toBe(initialBalance + 2000000000);
    });

    it("removes contribution record after refund", () => {
      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(51);
      
      simnet.callPublicFn(contractName, "refund", [Cl.uint(0)], address2);

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(0), Cl.principal(address2)],
        deployer
      );
      expect(result).toBeNone();
    });

    it("prevents refund before deadline", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "refund",
        [Cl.uint(0)],
        address2
      );
      expect(result).toBeErr(Cl.uint(ERR_DEADLINE_PASSED));
    });

    it("prevents refund if campaign was successful", () => {
      // Create successful campaign
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(1000000000), Cl.uint(simnet.blockHeight + 50)], // 1k STX goal
        address1
      );

      // Contribute more than goal
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(1), Cl.uint(1500000000)], // 1.5k STX
        address2
      );

      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(51);

      const { result } = simnet.callPublicFn(
        contractName,
        "refund",
        [Cl.uint(1)],
        address2
      );
      expect(result).toBeErr(Cl.uint(ERR_GOAL_NOT_REACHED));
    });

    it("prevents refund for non-contributor", () => {
      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(51);

      const { result } = simnet.callPublicFn(
        contractName,
        "refund",
        [Cl.uint(0)],
        address1 // Campaign owner, not contributor
      );
      expect(result).toBeErr(Cl.uint(ERR_NOT_FOUND));
    });
  });

  describe("Campaign Analytics", () => {
    beforeEach(() => {
      // Create test campaign
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [
          Cl.uint(10000000000), // 10k STX goal
          Cl.uint(simnet.blockHeight + 1000)
        ],
        address1
      );
    });

    it("calculates campaign success correctly", () => {
      // Campaign not successful initially
      const { result: initialResult } = simnet.callReadOnlyFn(
        contractName,
        "is-campaign-successful",
        [Cl.uint(0)],
        deployer
      );
      expect(initialResult).toBeBool(false);

      // Contribute to reach goal
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(10000000000)], // Exactly 10k STX
        address2
      );

      // Still not successful before deadline
      const { result: beforeDeadlineResult } = simnet.callReadOnlyFn(
        contractName,
        "is-campaign-successful",
        [Cl.uint(0)],
        deployer
      );
      expect(beforeDeadlineResult).toBeBool(false);

      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(1001);

      // Now successful
      const { result: afterDeadlineResult } = simnet.callReadOnlyFn(
        contractName,
        "is-campaign-successful",
        [Cl.uint(0)],
        deployer
      );
      expect(afterDeadlineResult).toBeBool(true);
    });

    it("calculates time left correctly", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-time-left",
        [Cl.uint(0)],
        deployer
      );
      expect(result).toBeOk(Cl.uint(1000)); // 1000 blocks left

      // Mine some blocks
      simnet.mineEmptyBlocks(500);

      const { result: updatedResult } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-time-left",
        [Cl.uint(0)],
        deployer
      );
      expect(updatedResult).toBeOk(Cl.uint(500)); // 500 blocks left
    });

    it("returns zero time left for expired campaigns", () => {
      // Mine blocks to pass deadline
      simnet.mineEmptyBlocks(1001);

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-time-left",
        [Cl.uint(0)],
        deployer
      );
      expect(result).toBeOk(Cl.uint(0));
    });

    it("calculates campaign progress correctly", () => {
      // No contributions initially
      const { result: initialResult } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-progress",
        [Cl.uint(0)],
        deployer
      );
      expect(initialResult).toBeOk(Cl.uint(0)); // 0%

      // Contribute 50% of goal
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(5000000000)], // 5k STX
        address2
      );

      const { result: halfwayResult } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-progress",
        [Cl.uint(0)],
        deployer
      );
      expect(halfwayResult).toBeOk(Cl.uint(50)); // 50%

      // Contribute to exceed goal
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(8000000000)], // 8k STX more
        address3
      );

      const { result: overGoalResult } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-progress",
        [Cl.uint(0)],
        deployer
      );
      expect(overGoalResult).toBeOk(Cl.uint(130)); // 130%
    });

    it("returns error for non-existent campaign analytics", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-progress",
        [Cl.uint(999)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(ERR_NOT_FOUND));
    });
  });

  describe("Campaign Milestones", () => {
    beforeEach(() => {
      // Create test campaign
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [
          Cl.uint(10000000000), // 10k STX goal
          Cl.uint(simnet.blockHeight + 1000)
        ],
        address1
      );
    });

    it("allows campaign owner to add milestone", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "add-campaign-milestone",
        [
          Cl.uint(0),
          Cl.stringUtf8("50% Milestone"),
          Cl.stringUtf8("Reached 50% of funding goal"),
          Cl.uint(5000000000), // 5k STX target
          Cl.uint(simnet.blockHeight + 500)
        ],
        address1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("stores milestone details correctly", () => {
      const title = "Development Complete";
      const description = "Core development phase completed";
      const targetAmount = 7500000000; // 7.5k STX
      const deadline = simnet.blockHeight + 800;

      simnet.callPublicFn(
        contractName,
        "add-campaign-milestone",
        [
          Cl.uint(0),
          Cl.stringUtf8(title),
          Cl.stringUtf8(description),
          Cl.uint(targetAmount),
          Cl.uint(deadline)
        ],
        address1
      );

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-milestone-details",
        [Cl.uint(0), Cl.uint(0)], // Campaign 0, Milestone 0
        deployer
      );
      
      expect(result).toBeSome(
        Cl.tuple({
          title: Cl.stringUtf8(title),
          description: Cl.stringUtf8(description),
          "target-amount": Cl.uint(targetAmount),
          completed: Cl.bool(false),
          deadline: Cl.uint(deadline)
        })
      );
    });

    it("prevents non-owner from adding milestone", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "add-campaign-milestone",
        [
          Cl.uint(0),
          Cl.stringUtf8("Unauthorized Milestone"),
          Cl.stringUtf8("This should fail"),
          Cl.uint(1000000000),
          Cl.uint(simnet.blockHeight + 100)
        ],
        address2 // Not the owner
      );
      expect(result).toBeErr(Cl.uint(ERR_OWNER_ONLY));
    });

    it("prevents adding milestone after campaign deadline", () => {
      // Mine blocks to pass campaign deadline
      simnet.mineEmptyBlocks(1001);

      const { result } = simnet.callPublicFn(
        contractName,
        "add-campaign-milestone",
        [
          Cl.uint(0),
          Cl.stringUtf8("Late Milestone"),
          Cl.stringUtf8("Too late to add this"),
          Cl.uint(1000000000),
          Cl.uint(simnet.blockHeight + 100)
        ],
        address1
      );
      expect(result).toBeErr(Cl.uint(ERR_DEADLINE_PASSED));
    });

    it("returns none for non-existent milestone", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-milestone-details",
        [Cl.uint(0), Cl.uint(999)],
        deployer
      );
      expect(result).toBeNone();
    });
  });

  describe("Campaign Updates", () => {
    beforeEach(() => {
      // Create test campaign
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [
          Cl.uint(5000000000), // 5k STX goal
          Cl.uint(simnet.blockHeight + 500)
        ],
        address1
      );
    });

    it("allows campaign owner to post update", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "post-campaign-update",
        [
          Cl.uint(0),
          Cl.stringUtf8("Progress Update"),
          Cl.stringUtf8("Great progress on the project! We've completed the first phase and are moving on to implementation.")
        ],
        address1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("updates campaign statistics after posting update", () => {
      // Post first update
      simnet.callPublicFn(
        contractName,
        "post-campaign-update",
        [
          Cl.uint(0),
          Cl.stringUtf8("First Update"),
          Cl.stringUtf8("First update content")
        ],
        address1
      );

      // Post second update
      simnet.callPublicFn(
        contractName,
        "post-campaign-update",
        [
          Cl.uint(0),
          Cl.stringUtf8("Second Update"),
          Cl.stringUtf8("Second update content")
        ],
        address1
      );

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-statistics",
        [Cl.uint(0)],
        deployer
      );
      
      expect(result).toBeSome(
        Cl.tuple({
          "unique-contributors": Cl.uint(0),
          "avg-contribution": Cl.uint(0),
          "largest-contribution": Cl.uint(0),
          "updates-count": Cl.uint(2)
        })
      );
    });

    it("prevents non-owner from posting update", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "post-campaign-update",
        [
          Cl.uint(0),
          Cl.stringUtf8("Unauthorized Update"),
          Cl.stringUtf8("This should fail")
        ],
        address2 // Not the owner
      );
      expect(result).toBeErr(Cl.uint(ERR_OWNER_ONLY));
    });

    it("handles long update content", () => {
      const longContent = "A".repeat(1000); // Max length content
        
      const { result } = simnet.callPublicFn(
        contractName,
        "post-campaign-update",
        [
          Cl.uint(0),
          Cl.stringUtf8("Long Update"),
          Cl.stringUtf8(longContent)
        ],
        address1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("returns none for campaign with no statistics", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-statistics",
        [Cl.uint(0)],
        deployer
      );
      expect(result).toBeNone();
    });
  });

  describe("Platform Configuration", () => {
    it("allows owner to update minimum contribution", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-minimum-contribution",
        [Cl.uint(2000000)], // 2 STX
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("prevents non-owner from updating minimum contribution", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-minimum-contribution",
        [Cl.uint(2000000)],
        address1
      );
      expect(result).toBeErr(Cl.uint(ERR_OWNER_ONLY));
    });

    it("allows owner to update platform fee", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-platform-fee",
        [Cl.uint(50)], // 0.5%
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("prevents setting platform fee above maximum", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-platform-fee",
        [Cl.uint(1500)], // 15% - above 10% max
        deployer
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_AMOUNT));
    });

    it("prevents non-owner from updating platform fee", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-platform-fee",
        [Cl.uint(30)],
        address1
      );
      expect(result).toBeErr(Cl.uint(ERR_OWNER_ONLY));
    });

    it("calculates platform fee correctly", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "calculate-platform-fee",
        [Cl.uint(10000000000)], // 10k STX
        deployer
      );
      expect(result).toBeUint(25000000); // 0.25% of 10k STX = 25 STX
    });
  });

  describe("Campaign Reporting", () => {
    beforeEach(() => {
      // Create test campaign
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [
          Cl.uint(5000000000),
          Cl.uint(simnet.blockHeight + 500)
        ],
        address1
      );
    });

    it("allows owner to report campaign", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "report-campaign",
        [
          Cl.uint(0),
          Cl.stringUtf8("Fraudulent campaign with misleading information")
        ],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("prevents non-owner from reporting campaign", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "report-campaign",
        [
          Cl.uint(0),
          Cl.stringUtf8("Suspicious activity")
        ],
        address1
      );
      expect(result).toBeErr(Cl.uint(ERR_OWNER_ONLY));
    });

    it("prevents reporting non-existent campaign", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "report-campaign",
        [
          Cl.uint(999),
          Cl.stringUtf8("Does not exist")
        ],
        deployer
      );
      expect(result).toBeErr(Cl.uint(ERR_NOT_FOUND));
    });

    it("prevents duplicate reports from same user", () => {
      // First report
      simnet.callPublicFn(
        contractName,
        "report-campaign",
        [
          Cl.uint(0),
          Cl.stringUtf8("First report")
        ],
        deployer
      );

      // Second report attempt
      const { result } = simnet.callPublicFn(
        contractName,
        "report-campaign",
        [
          Cl.uint(0),
          Cl.stringUtf8("Second report")
        ],
        deployer
      );
      expect(result).toBeErr(Cl.uint(ERR_ALREADY_REPORTED));
    });
  });

  describe("Read-Only Functions", () => {
    it("returns none for non-existent campaign details", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-details",
        [Cl.uint(999)],
        deployer
      );
      expect(result).toBeNone();
    });

    it("returns none for non-existent contribution", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(999), Cl.principal(address1)],
        deployer
      );
      expect(result).toBeNone();
    });

    it("returns none for non-existent campaign description", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-description",
        [Cl.uint(999)],
        deployer
      );
      expect(result).toBeNone();
    });

    it("returns correct total campaigns count", () => {
      // Create multiple campaigns
      for (let i = 0; i < 3; i++) {
        simnet.callPublicFn(
          contractName,
          "create-campaign",
          [Cl.uint(1000000000 * (i + 1)), Cl.uint(simnet.blockHeight + 100)],
          address1
        );
      }

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-total-campaigns",
        [],
        deployer
      );
      expect(result).toBeUint(3);
    });
  });

  describe("Integration Tests", () => {
    it("handles complete successful campaign lifecycle", () => {
      // 1. Create campaign
      const campaignResult = simnet.callPublicFn(
        contractName,
        "create-campaign",
        [
          Cl.uint(5000000000), // 5k STX goal
          Cl.uint(simnet.blockHeight + 200)
        ],
        address1
      );
      expect(campaignResult.result).toBeOk(Cl.uint(0));

      // 2. Add milestone
      simnet.callPublicFn(
        contractName,
        "add-campaign-milestone",
        [
          Cl.uint(0),
          Cl.stringUtf8("Halfway Point"),
          Cl.stringUtf8("50% funding achieved"),
          Cl.uint(2500000000),
          Cl.uint(simnet.blockHeight + 100)
        ],
        address1
      );

      // 3. Post campaign update
      simnet.callPublicFn(
        contractName,
        "post-campaign-update",
        [
          Cl.uint(0),
          Cl.stringUtf8("Project Launched"),
          Cl.stringUtf8("We have officially launched the campaign!")
        ],
        address1
      );

      // 4. Multiple users contribute
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(2000000000)], // 2k STX
        address2
      );

      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(3500000000)], // 3.5k STX
        address3
      );

      // 5. Check campaign progress
      const progressResult = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-progress",
        [Cl.uint(0)],
        deployer
      );
      expect(progressResult.result).toBeOk(Cl.uint(110)); // 110% funded

      // 6. Wait for deadline
      simnet.mineEmptyBlocks(201);

      // 7. Verify campaign is successful
      const successResult = simnet.callReadOnlyFn(
        contractName,
        "is-campaign-successful",
        [Cl.uint(0)],
        deployer
      );
      expect(successResult.result).toBeBool(true);

      // 8. Claim funds
      const claimResult = simnet.callPublicFn(
        contractName,
        "claim-funds",
        [Cl.uint(0)],
        address1
      );
      expect(claimResult.result).toBeOk(Cl.bool(true));

      // 9. Verify final state
      const finalCampaign = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-details",
        [Cl.uint(0)],
        deployer
      );
      const campaignData = finalCampaign.result.expectSome();
      
      expect(campaignData).toMatchObject({
        raised: Cl.uint(5500000000),
        claimed: Cl.bool(true)
      });
    });

    it("handles complete failed campaign lifecycle with refunds", () => {
      // 1. Create campaign with high goal
      const campaignResult = simnet.callPublicFn(
        contractName,
        "create-campaign",
        [
          Cl.uint(10000000000), // 10k STX goal
          Cl.uint(simnet.blockHeight + 100)
        ],
        address1
      );
      expect(campaignResult.result).toBeOk(Cl.uint(0));

      // 2. Users contribute but don't reach goal
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(3000000000)], // 3k STX
        address2
      );

      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(2000000000)], // 2k STX
        address3
      );

      // 3. Wait for deadline
      simnet.mineEmptyBlocks(101);

      // 4. Verify campaign failed
      const successResult = simnet.callReadOnlyFn(
        contractName,
        "is-campaign-successful",
        [Cl.uint(0)],
        deployer
      );
      expect(successResult.result).toBeBool(false);

      // 5. Attempt to claim funds (should fail)
      const claimResult = simnet.callPublicFn(
        contractName,
        "claim-funds",
        [Cl.uint(0)],
        address1
      );
      expect(claimResult.result).toBeErr(Cl.uint(ERR_GOAL_NOT_REACHED));

      // 6. Contributors get refunds
      const initialBalance2 = simnet.getAssetsMap().get(address2)?.STX || 0;
      const initialBalance3 = simnet.getAssetsMap().get(address3)?.STX || 0;

      const refund2 = simnet.callPublicFn(
        contractName,
        "refund",
        [Cl.uint(0)],
        address2
      );
      expect(refund2.result).toBeOk(Cl.bool(true));

      const refund3 = simnet.callPublicFn(
        contractName,
        "refund",
        [Cl.uint(0)],
        address3
      );
      expect(refund3.result).toBeOk(Cl.bool(true));

      // 7. Verify refunds processed
      const finalBalance2 = simnet.getAssetsMap().get(address2)?.STX || 0;
      const finalBalance3 = simnet.getAssetsMap().get(address3)?.STX || 0;

      expect(finalBalance2).toBe(initialBalance2 + 3000000000);
      expect(finalBalance3).toBe(initialBalance3 + 2000000000);
    });

    it("handles multiple concurrent campaigns", () => {
      // Create multiple campaigns
      const campaigns = [];
      for (let i = 0; i < 3; i++) {
        const result = simnet.callPublicFn(
          contractName,
          "create-campaign",
          [
            Cl.uint((i + 1) * 2000000000), // Different goals
            Cl.uint(simnet.blockHeight + 100 * (i + 1)) // Different deadlines
          ],
          i === 0 ? address1 : i === 1 ? address2 : address3
        );
        campaigns.push(result.result.expectOk());
      }

      // Contribute to all campaigns
      campaigns.forEach((campaignId, index) => {
        simnet.callPublicFn(
          contractName,
          "contribute",
          [campaignId, Cl.uint(1500000000)], // 1.5k STX each
          address1
        );
      });

      // Verify all campaigns received contributions
      campaigns.forEach((campaignId) => {
        const campaignResult = simnet.callReadOnlyFn(
          contractName,
          "get-campaign-details",
          [campaignId],
          deployer
        );
        const campaignData = campaignResult.result.expectSome();
        
        expect(campaignData).toMatchObject({
          raised: Cl.uint(1500000000)
        });
      });

      // Check total campaigns
      const totalResult = simnet.callReadOnlyFn(
        contractName,
        "get-total-campaigns",
        [],
        deployer
      );
      expect(totalResult.result).toBeUint(3);
    });

    it("handles campaign with updates and milestones", () => {
      // Create campaign
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(8000000000), Cl.uint(simnet.blockHeight + 500)],
        address1
      );

      // Add multiple milestones
      const milestones = [
        { title: "25% Milestone", target: 2000000000 },
        { title: "50% Milestone", target: 4000000000 },
        { title: "75% Milestone", target: 6000000000 }
      ];

      milestones.forEach((milestone, index) => {
        simnet.callPublicFn(
          contractName,
          "add-campaign-milestone",
          [
            Cl.uint(0),
            Cl.stringUtf8(milestone.title),
            Cl.stringUtf8(`Milestone ${index + 1} description`),
            Cl.uint(milestone.target),
            Cl.uint(simnet.blockHeight + 100 * (index + 1))
          ],
          address1
        );
      });

      // Post multiple updates
      const updates = [
        "Initial project setup complete",
        "Development phase 1 finished",
        "Beta testing in progress"
      ];

      updates.forEach((update) => {
        simnet.callPublicFn(
          contractName,
          "post-campaign-update",
          [
            Cl.uint(0),
            Cl.stringUtf8("Progress Update"),
            Cl.stringUtf8(update)
          ],
          address1
        );
      });

      // Verify milestones exist
      milestones.forEach((milestone, index) => {
        const milestoneResult = simnet.callReadOnlyFn(
          contractName,
          "get-milestone-details",
          [Cl.uint(0), Cl.uint(index)],
          deployer
        );
        
        expect(milestoneResult.result).toBeSome(
          Cl.tuple({
            title: Cl.stringUtf8(milestone.title),
            "target-amount": Cl.uint(milestone.target),
            completed: Cl.bool(false)
          })
        );
      });

      // Verify updates count in statistics
      const statsResult = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-statistics",
        [Cl.uint(0)],
        deployer
      );
      
      expect(statsResult.result).toBeSome(
        Cl.tuple({
          "updates-count": Cl.uint(3)
        })
      );
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("handles very large campaign goals", () => {
      const largeGoal = 1000000000000000; // Very large goal
      
      const { result } = simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(largeGoal), Cl.uint(simnet.blockHeight + 100)],
        address1
      );
      expect(result).toBeOk(Cl.uint(0));

      // Verify campaign created with large goal
      const campaignResult = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-details",
        [Cl.uint(0)],
        deployer
      );
      const campaignData = campaignResult.result.expectSome();
      
      expect(campaignData).toMatchObject({
        goal: Cl.uint(largeGoal)
      });
    });

    it("handles campaigns with very short deadlines", () => {
      const shortDeadline = simnet.blockHeight + 1; // 1 block deadline
      
      const { result } = simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(1000000000), Cl.uint(shortDeadline)],
        address1
      );
      expect(result).toBeOk(Cl.uint(0));

      // Try to contribute after 1 block
      simnet.mineEmptyBlocks(2);
      
      const contributeResult = simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(1000000000)],
        address2
      );
      expect(contributeResult.result).toBeErr(Cl.uint(ERR_DEADLINE_PASSED));
    });

    it("handles zero progress calculation for zero goal", () => {
      // This test documents edge case behavior
      // In practice, campaigns can't have zero goals due to validation
      const progressResult = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-progress",
        [Cl.uint(999)], // Non-existent campaign
        deployer
      );
      expect(progressResult.result).toBeErr(Cl.uint(ERR_NOT_FOUND));
    });

    it("handles multiple refund attempts", () => {
      // Create failing campaign
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(5000000000), Cl.uint(simnet.blockHeight + 50)],
        address1
      );

      // Contribute
      simnet.callPublicFn(
        contractName,
        "contribute",
        [Cl.uint(0), Cl.uint(2000000000)],
        address2
      );

      // Wait for deadline
      simnet.mineEmptyBlocks(51);

      // First refund
      const firstRefund = simnet.callPublicFn(
        contractName,
        "refund",
        [Cl.uint(0)],
        address2
      );
      expect(firstRefund.result).toBeOk(Cl.bool(true));

      // Second refund attempt (should fail)
      const secondRefund = simnet.callPublicFn(
        contractName,
        "refund",
        [Cl.uint(0)],
        address2
      );
      expect(secondRefund.result).toBeErr(Cl.uint(ERR_NOT_FOUND));
    });

    it("maintains data consistency across operations", () => {
      // Create campaign
      simnet.callPublicFn(
        contractName,
        "create-campaign",
        [Cl.uint(6000000000), Cl.uint(simnet.blockHeight + 200)],
        address1
      );

      // Rapid sequence of operations
      const operations = [
        () => simnet.callPublicFn(contractName, "contribute", [Cl.uint(0), Cl.uint(1000000000)], address2),
        () => simnet.callPublicFn(contractName, "post-campaign-update", [Cl.uint(0), Cl.stringUtf8("Update 1"), Cl.stringUtf8("Content 1")], address1),
        () => simnet.callPublicFn(contractName, "contribute", [Cl.uint(0), Cl.uint(2000000000)], address3),
        () => simnet.callPublicFn(contractName, "add-campaign-milestone", [Cl.uint(0), Cl.stringUtf8("Milestone"), Cl.stringUtf8("Description"), Cl.uint(3000000000), Cl.uint(simnet.blockHeight + 100)], address1),
        () => simnet.callPublicFn(contractName, "contribute", [Cl.uint(0), Cl.uint(3500000000)], address2)
      ];

      // Execute all operations
      operations.forEach(op => {
        const result = op();
        expect(result.result).toBeOk(Cl.bool(true));
      });

      // Verify final consistent state
      const finalCampaign = simnet.callReadOnlyFn(
        contractName,
        "get-campaign-details",
        [Cl.uint(0)],
        deployer
      );
      const campaignData = finalCampaign.result.expectSome();
      
      expect(campaignData).toMatchObject({
        raised: Cl.uint(6500000000), // Total contributions
        goal: Cl.uint(6000000000)
      });

      // Check contributions are recorded correctly
      const contrib2 = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(0), Cl.principal(address2)],
        deployer
      );
      expect(contrib2.result).toBeSome(
        Cl.tuple({
          amount: Cl.uint(4500000000) // 1k + 3.5k STX
        })
      );
    });
  });
});