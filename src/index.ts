#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance, AxiosError } from 'axios';

// API key from environment variable
const API_KEY = process.env.DUBCO_API_KEY;
if (!API_KEY) {
  throw new Error('DUBCO_API_KEY environment variable is required');
}

// Base URL for Dub.co API
const API_BASE_URL = 'https://api.dub.co';

// Types for Dub.co API
interface Domain {
  id: string;
  slug: string;
  verified: boolean;
  primary: boolean;
  archived: boolean;
  placeholder?: string;
  expiredUrl?: string;
  notFoundUrl?: string;
  logo?: string;
  createdAt: string;
  updatedAt: string;
}

interface Link {
  id: string;
  domain: string;
  key: string;
  url: string;
  shortLink: string;
  // ... other properties
}

interface CreateLinkParams {
  url: string;
  domain?: string;
  key?: string;
  externalId?: string;
  // ... other optional parameters
}

interface UpdateLinkParams {
  url?: string;
  domain?: string;
  key?: string;
  externalId?: string;
  // ... other optional parameters
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

class DubcoServer {
  private server: Server;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'dubco-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_link',
          description: 'Create a new short link on dub.co, asking the user which domain to use',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The destination URL to shorten',
              },
              key: {
                type: 'string',
                description: 'Optional custom slug for the short link. If not provided, a random slug will be generated.',
              },
              externalId: {
                type: 'string',
                description: 'Optional external ID for the link',
              },
              domain: {
                type: 'string',
                description: 'Optional domain slug to use. If not provided, the primary domain will be used.'
              }
            },
            required: ['url'],
          },
        },
        {
          name: 'update_link',
          description: 'Update an existing short link on dub.co',
          inputSchema: {
            type: 'object',
            properties: {
              linkId: {
                type: 'string',
                description: 'The ID of the link to update',
              },
              url: {
                type: 'string',
                description: 'The new destination URL',
              },
              domain: {
                type: 'string',
                description: 'The new domain for the short link',
              },
              key: {
                type: 'string',
                description: 'The new slug for the short link',
              },
            },
            required: ['linkId'],
          },
        },
        {
          name: 'upsert_link',
          description: 'Create or update a short link on dub.co, asking the user which domain to use if creating',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The destination URL to shorten',
              },
              key: {
                type: 'string',
                description: 'Optional custom slug for the short link. If not provided, a random slug will be generated.',
              },
              externalId: {
                type: 'string',
                description: 'Optional external ID for the link',
              },
              domain: {
                type: 'string',
                description: 'Optional domain slug to use. If not provided, the primary domain will be used.'
              }
            },
            required: ['url'],
          },
        },
        {
          name: 'delete_link',
          description: 'Delete a short link on dub.co',
          inputSchema: {
            type: 'object',
            properties: {
              linkId: {
                type: 'string',
                description: 'The ID of the link to delete',
              },
            },
            required: ['linkId'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'create_link':
            return await this.createLink(request.params.arguments);
          case 'update_link':
            return await this.updateLink(request.params.arguments);
          case 'upsert_link':
            return await this.upsertLink(request.params.arguments);
          case 'delete_link':
            return await this.deleteLink(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError<ApiErrorResponse>;
          const statusCode = axiosError.response?.status;
          const errorData = axiosError.response?.data;
          const errorMessage = errorData?.error || errorData?.message || axiosError.message;
          
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${statusCode} - ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          `Unexpected error: ${(error as Error).message}`
        );
      }
    });
  }

  private async getDomains(): Promise<Domain[]> {
    try {
      const response = await this.axiosInstance.get('/domains');
      return response.data;
    } catch (error) {
      console.error('Error fetching domains:', error);
      throw error;
    }
  }

  private async getPrimaryDomain(): Promise<Domain> {
    const domains = await this.getDomains();
    
    if (domains.length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'No domains available in your workspace'
      );
    }
    
    // Find the primary domain or use the first one
    const primaryDomain = domains.find(domain => domain.primary) || domains[0];
    return primaryDomain;
  }

  private async getDomainBySlug(slug: string): Promise<Domain | undefined> {
    const domains = await this.getDomains();
    return domains.find(domain => domain.slug === slug);
  }

  private async createLink(args: any): Promise<any> {
    if (!args.url) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'URL is required'
      );
    }

    try {
      // Determine which domain to use
      let domain: Domain;
      
      if (args.domain) {
        // If domain is specified, try to find it
        const foundDomain = await this.getDomainBySlug(args.domain);
        if (!foundDomain) {
          return {
            content: [
              {
                type: 'text',
                text: `Domain "${args.domain}" not found. Using primary domain instead.`,
              },
            ],
            isError: false,
          };
        }
        domain = foundDomain;
      } else {
        // Otherwise use the primary domain
        domain = await this.getPrimaryDomain();
      }
      
      // Create the link with the selected domain
      const createParams: CreateLinkParams = {
        url: args.url,
        domain: domain.slug,
      };
      
      if (args.key) {
        createParams.key = args.key;
      }
      
      if (args.externalId) {
        createParams.externalId = args.externalId;
      }
      
      const response = await this.axiosInstance.post('/links', createParams);
      const link = response.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `Short link created: ${link.shortLink}\n\nDestination: ${link.url}\nID: ${link.id}`,
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ApiErrorResponse>;
        const statusCode = axiosError.response?.status;
        const errorData = axiosError.response?.data;
        const errorMessage = errorData?.error || errorData?.message || axiosError.message;
        
        return {
          content: [
            {
              type: 'text',
              text: `Error creating link: ${statusCode} - ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Error creating link: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async updateLink(args: any): Promise<any> {
    if (!args.linkId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Link ID is required'
      );
    }

    // Prepare update parameters
    const updateParams: UpdateLinkParams = {};
    
    if (args.url) {
      updateParams.url = args.url;
    }
    
    if (args.domain) {
      updateParams.domain = args.domain;
    }
    
    if (args.key) {
      updateParams.key = args.key;
    }
    
    if (Object.keys(updateParams).length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'At least one parameter to update is required'
      );
    }
    
    try {
      const response = await this.axiosInstance.patch(`/links/${args.linkId}`, updateParams);
      const link = response.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `Link updated: ${link.shortLink}\n\nDestination: ${link.url}\nID: ${link.id}`,
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ApiErrorResponse>;
        const statusCode = axiosError.response?.status;
        const errorData = axiosError.response?.data;
        const errorMessage = errorData?.error || errorData?.message || axiosError.message;
        
        return {
          content: [
            {
              type: 'text',
              text: `Error updating link: ${statusCode} - ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
      
      throw error;
    }
  }

  private async upsertLink(args: any): Promise<any> {
    if (!args.url) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'URL is required'
      );
    }

    try {
      // Determine which domain to use
      let domain: Domain;
      
      if (args.domain) {
        // If domain is specified, try to find it
        const foundDomain = await this.getDomainBySlug(args.domain);
        if (!foundDomain) {
          return {
            content: [
              {
                type: 'text',
                text: `Domain "${args.domain}" not found. Using primary domain instead.`,
              },
            ],
            isError: false,
          };
        }
        domain = foundDomain;
      } else {
        // Otherwise use the primary domain
        domain = await this.getPrimaryDomain();
      }
      
      // Upsert the link with the selected domain
      const upsertParams: CreateLinkParams = {
        url: args.url,
        domain: domain.slug,
      };
      
      if (args.key) {
        upsertParams.key = args.key;
      }
      
      if (args.externalId) {
        upsertParams.externalId = args.externalId;
      }
      
      const response = await this.axiosInstance.put('/links/upsert', upsertParams);
      const link = response.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `Short link upserted: ${link.shortLink}\n\nDestination: ${link.url}\nID: ${link.id}`,
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ApiErrorResponse>;
        const statusCode = axiosError.response?.status;
        const errorData = axiosError.response?.data;
        const errorMessage = errorData?.error || errorData?.message || axiosError.message;
        
        return {
          content: [
            {
              type: 'text',
              text: `Error upserting link: ${statusCode} - ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Error upserting link: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async deleteLink(args: any): Promise<any> {
    if (!args.linkId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Link ID is required'
      );
    }
    
    try {
      const response = await this.axiosInstance.delete(`/links/${args.linkId}`);
      
      return {
        content: [
          {
            type: 'text',
            text: `Link with ID ${args.linkId} has been deleted.`,
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ApiErrorResponse>;
        const statusCode = axiosError.response?.status;
        const errorData = axiosError.response?.data;
        const errorMessage = errorData?.error || errorData?.message || axiosError.message;
        
        return {
          content: [
            {
              type: 'text',
              text: `Error deleting link: ${statusCode} - ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
      
      throw error;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Dub.co MCP server running on stdio');
  }
}

const server = new DubcoServer();
server.run().catch(console.error);