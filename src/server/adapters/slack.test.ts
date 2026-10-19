import {describe,it,expect,vi,afterEach} from "vitest";
import {ComposioNotifier} from "./slack";
import {ComposioClient} from "./composio";
afterEach(()=>vi.unstubAllEnvs());
function setup(){vi.stubEnv("COMPOSIO_API_KEY","test-only");vi.stubEnv("COMPOSIO_SLACK_CONNECTED_ACCOUNT_ID","test-own-account");const execute=vi.fn();return {execute,notifier:new ComposioNotifier({execute} as unknown as ComposioClient)};}
describe("own-DM-only Slack notifier",()=>{
  it("derives the recipient from authentication and posts only to that DM",async()=>{const {execute,notifier}=setup();execute.mockResolvedValueOnce({user_id:"UOWNER"}).mockResolvedValueOnce({channels:[{id:"DOTHER",user:"UOTHER",is_im:true},{id:"DSELF",user:"UOWNER",is_im:true}]}).mockResolvedValueOnce({ok:true});await notifier.notifySelf("Material price change");expect(execute.mock.calls[1]).toEqual(["SLACK_LIST_ALL_CHANNELS","test-own-account",{types:"im",limit:200,exclude_archived:true}]);expect(execute.mock.calls[2][2].channel).toBe("DSELF");expect(execute).toHaveBeenCalledTimes(3);});
  it("refuses a third party even if Slack returns a different user",async()=>{const {execute,notifier}=setup();execute.mockResolvedValueOnce({user_id:"UOWNER"}).mockResolvedValueOnce({channels:[{id:"DOTHER",user:"UOTHER",is_im:true}]});await expect(notifier.notifySelf("Test")).rejects.toThrow("No message");expect(execute).toHaveBeenCalledTimes(2);});
  it("refuses a public channel",async()=>{const {execute,notifier}=setup();execute.mockResolvedValueOnce({user_id:"UOWNER"}).mockResolvedValueOnce({channels:[{id:"CPUBLIC",user:"UOWNER",is_im:false}]});await expect(notifier.notifySelf("Test")).rejects.toThrow();expect(execute).toHaveBeenCalledTimes(2);});
  it("refuses bot identities",async()=>{const {execute,notifier}=setup();execute.mockResolvedValueOnce({user_id:"UBOT",bot_id:"BBOT"});await expect(notifier.notifySelf("Test")).rejects.toThrow("Slack user");expect(execute).toHaveBeenCalledTimes(1);});
  it("does not call any Slack tool when disconnected",async()=>{const {execute,notifier}=setup();vi.stubEnv("COMPOSIO_API_KEY","");await expect(notifier.notifySelf("Test")).rejects.toThrow("not connected");expect(execute).not.toHaveBeenCalled();});
});
