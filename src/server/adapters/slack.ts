import { z } from "zod";
import type { Notifier } from "./interfaces";
import { config } from "../config";
import { ComposioClient } from "./composio";

// There is deliberately no channel, user ID, or recipient parameter.
export class ComposioNotifier implements Notifier {
  constructor(private client = new ComposioClient()){}
  async notifySelf(text:string) {
    const env=config(),account=env.COMPOSIO_SLACK_CONNECTED_ACCOUNT_ID;
    if(!env.COMPOSIO_API_KEY || !account)throw new Error("Slack is not connected. Add COMPOSIO_SLACK_CONNECTED_ACCOUNT_ID; the summary is kept here.");
    const identity=await this.client.execute("SLACK_TEST_AUTH",account,{});
    const self=z.string().regex(/^[UW][A-Z0-9]+$/).parse(identity.user_id);
    if(identity.bot_id)throw new Error("Use a Slack user connection, not a Slackbot connection, so your own DM can be verified.");
    // Slack conversations.open excludes the caller from `users`; self DMs may
    // therefore need resolving from the existing IM list instead of creation.
    let cursor:string|undefined,own:unknown;
    for(let page=0;page<20;page++) {
      const listed=await this.client.execute("SLACK_LIST_ALL_CHANNELS",account,{types:"im",limit:200,exclude_archived:true,...(cursor?{cursor}:{})});
      const channels=z.array(z.object({id:z.string(),user:z.string().optional(),is_im:z.boolean().optional(),is_mpim:z.boolean().optional()})).parse(listed.channels??[]);
      own=channels.find((c)=>c.user===self&&c.id.startsWith("D")&&!c.is_mpim);
      if(own)break;
      const metadata=listed.response_metadata as {next_cursor?:string}|undefined;
      cursor=metadata?.next_cursor;if(!cursor)break;
    }
    if(!own)throw new Error("Your own Slack DM could not be resolved. Open your self DM in Slack and grant im:read; the summary is preserved in the UI. No message was posted.");
    const opened={channel:own};
    const channel=z.object({id:z.string().regex(/^D[A-Z0-9]+$/),user:z.string().optional(),is_im:z.boolean().optional(),is_mpim:z.boolean().optional()}).parse(opened.channel);
    if(channel.is_mpim || channel.is_im===false || (channel.user && channel.user!==self))throw new Error("Slack did not confirm the authenticated user's own DM. No message was posted.");
    await this.client.execute("SLACK_SEND_MESSAGE",account,{channel:channel.id,markdown_text:text.slice(0,10000).replace(/<[@#!][^>]*>/g,"[mention]"),unfurl_links:false,unfurl_media:false});
    return {url:`https://slack.com/app_redirect?channel=${encodeURIComponent(channel.id)}`};
  }
}
