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
    const opened=await this.client.execute("SLACK_OPEN_DM",account,{users:self,return_im:true});
    const channel=z.object({id:z.string().regex(/^D[A-Z0-9]+$/),user:z.string().optional(),is_im:z.boolean().optional(),is_mpim:z.boolean().optional()}).parse(opened.channel);
    if(channel.is_mpim || channel.is_im===false || (channel.user && channel.user!==self))throw new Error("Slack did not confirm the authenticated user's own DM. No message was posted.");
    await this.client.execute("SLACK_SEND_MESSAGE",account,{channel:channel.id,markdown_text:text.slice(0,10000).replace(/<[@#!][^>]*>/g,"[mention]"),unfurl_links:false,unfurl_media:false});
    return {url:`https://slack.com/app_redirect?channel=${encodeURIComponent(channel.id)}`};
  }
}
