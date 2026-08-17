import { Injectable, Logger } from '@nestjs/common';
import { gidFor, idFromGid } from './gid.util';
import {
  CUSTOMER_ADDRESS_BOOK_QUERY,
  CUSTOMER_ADDRESS_CREATE_MUTATION,
  CUSTOMER_ADDRESS_DELETE_MUTATION,
  CUSTOMER_ADDRESS_UPDATE_MUTATION,
  CUSTOMER_DEFAULT_ADDRESS_UPDATE_MUTATION,
  type AddressMutationResponse,
  type CustomerAddressBookResponse,
  type MailingAddressInput,
  type RawMailingAddress,
} from './queries/address.queries';
import { ShopifyGraphqlClient } from './shopify-graphql.client';

export interface AddressBook {
  addresses: RawMailingAddress[];
  /** Shopify ma kayo default chhe (numeric id) */
  defaultAddressId: string | null;
}

/**
 * Customer address book nu Shopify baaju nu kaam.
 *
 * ⚠️ AA BADHI METHODS **NEVER-THROW** CHHE — jaan-bujhi ne.
 *
 * Address sync e user ni request nu side-effect chhe, main kaam nahi. User e
 * "Save address" dabaavyu hoy ane Shopify e vakhte down hoy, to enu address
 * aapdi DB ma to save thavu j joiye. Etle ahiya thi failure `null`/`false`
 * tarike pachu jaay chhe ane caller `syncedAt` null rakhi ne pachhi retry
 * kari shake chhe.
 *
 * Aa niyam bhaangso — koi ek method throw karse — to Shopify no ek nano
 * hicchko user na address save thava dese nahi.
 */
@Injectable()
export class ShopifyAddressService {
  private readonly logger = new Logger(ShopifyAddressService.name);

  /** Ek customer na ketla addresses vaanchva. Shopify ni limit 250 chhe. */
  private static readonly MAX_ADDRESSES = 50;

  constructor(private readonly shopify: ShopifyGraphqlClient) {}

  /**
   * Shopify ma aa customer nu aakhu address book.
   *
   * Aa e jagya chhe jya user e WEBSITE par save karela addresses app ma
   * aave chhe — juna orders vaali import thi aa alag chhe (e fakt e address
   * aape chhe jena par kharekhar order thayo hoy).
   */
  async fetchAddressBook(shopifyCustomerId: string): Promise<AddressBook> {
    try {
      const data = await this.shopify.request<CustomerAddressBookResponse>(
        CUSTOMER_ADDRESS_BOOK_QUERY,
        {
          id: gidFor('Customer', shopifyCustomerId),
          first: ShopifyAddressService.MAX_ADDRESSES,
        },
        'customer.addressBook',
      );

      const customer = data.customer;
      if (!customer) return { addresses: [], defaultAddressId: null };

      return {
        addresses: customer.addressesV2.nodes,
        defaultAddressId: customer.defaultAddress
          ? idFromGid(customer.defaultAddress.id)
          : null,
      };
    } catch (err) {
      this.logger.warn(
        `Address book fetch failed for Shopify customer ${shopifyCustomerId}: ` +
          `${(err as Error).message}`,
      );
      return { addresses: [], defaultAddressId: null };
    }
  }

  /** @returns navo Shopify address id (numeric), ke `null` jo na banyo */
  async createAddress(
    shopifyCustomerId: string,
    address: MailingAddressInput,
    setAsDefault = false,
  ): Promise<string | null> {
    const result = await this.run(
      CUSTOMER_ADDRESS_CREATE_MUTATION,
      {
        customerId: gidFor('Customer', shopifyCustomerId),
        address,
        setAsDefault,
      },
      'customer.address.create',
      (d) => d.customerAddressCreate,
    );

    if (!result?.address) return null;

    const id = idFromGid(result.address.id);
    this.logger.log(
      `Shopify address ${id} created for customer ${shopifyCustomerId}`,
    );
    return id;
  }

  async updateAddress(
    shopifyCustomerId: string,
    shopifyAddressId: string,
    address: MailingAddressInput,
    setAsDefault = false,
  ): Promise<boolean> {
    const result = await this.run(
      CUSTOMER_ADDRESS_UPDATE_MUTATION,
      {
        customerId: gidFor('Customer', shopifyCustomerId),
        addressId: gidFor('MailingAddress', shopifyAddressId),
        address,
        setAsDefault,
      },
      'customer.address.update',
      (d) => d.customerAddressUpdate,
    );

    return Boolean(result?.address);
  }

  async deleteAddress(
    shopifyCustomerId: string,
    shopifyAddressId: string,
  ): Promise<boolean> {
    const result = await this.run(
      CUSTOMER_ADDRESS_DELETE_MUTATION,
      {
        customerId: gidFor('Customer', shopifyCustomerId),
        addressId: gidFor('MailingAddress', shopifyAddressId),
      },
      'customer.address.delete',
      (d) => d.customerAddressDelete,
    );

    return Boolean(result?.deletedAddressId);
  }

  async setDefaultAddress(
    shopifyCustomerId: string,
    shopifyAddressId: string,
  ): Promise<boolean> {
    const result = await this.run(
      CUSTOMER_DEFAULT_ADDRESS_UPDATE_MUTATION,
      {
        customerId: gidFor('Customer', shopifyCustomerId),
        addressId: gidFor('MailingAddress', shopifyAddressId),
      },
      'customer.address.setDefault',
      (d) => d.customerUpdateDefaultAddress,
    );

    return Boolean(result?.customer);
  }

  // -------------------------------------------------------------------------

  /**
   * Badhi mutations ek j rite chale chhe: request karo, `userErrors` check
   * karo, exception giળી jao.
   *
   * `userErrors` GraphQL na `errors` ma NATHI aavta — e `data` ni andar hoy
   * chhe. Aa check bhulai jaay to mutation chup-chaap fail thay ane code ne
   * laage ke badhu barabar chhe.
   */
  private async run<T extends { userErrors: Array<{ message: string }> }>(
    mutation: string,
    variables: Record<string, unknown>,
    label: string,
    pick: (data: AddressMutationResponse) => T | undefined,
  ): Promise<T | null> {
    try {
      const data = await this.shopify.request<AddressMutationResponse>(
        mutation,
        variables,
        label,
      );

      const result = pick(data);

      if (result?.userErrors?.length) {
        this.logger.warn(
          `${label} userErrors: ${result.userErrors
            .map((e) => e.message)
            .join(' | ')}`,
        );
        return null;
      }

      return result ?? null;
    } catch (err) {
      this.logger.warn(`${label} failed: ${(err as Error).message}`);
      return null;
    }
  }
}
